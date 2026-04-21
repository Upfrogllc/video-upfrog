// POST /api/analyze-video
// Body: { mode: 'youtube'|'upload', youtubeUrl?, fileUri?, mimeType?, filename? }
// Auth: Netlify Identity JWT required
// Returns: { record }  (newly inserted Supabase row)
//
// For upload mode, the browser uploads the video directly to Google's File API
// first (via create-upload.js) and passes us the resulting fileUri.

const { respond, preflight, requireAuth, supabaseRequest } = require('./_shared.js')

const GEMINI_MODEL = 'gemini-2.5-pro'
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const GEM_PROMPT = `You are the GEM (Generative Evaluation Method) Video Analyzer, a world-class marketing creative analyst with expertise in behavioral psychology, scroll-stopping advertising, and viral ad mechanics.

Your task is to deconstruct this video into structured marketing intelligence across FOUR layers:

LAYER 1 — VISUAL ENTITY IDENTIFICATION (The "Nouns")
- Setting
- Persona (approx age, style/fashion, personality cues)
- Persona Energy (calm / friendly / urgent / confident / relatable)
- Product Fingerprint (shape, color, usage, context of use)
- Implicit Product Category

LAYER 2 — SEMANTIC & AUDIO SENTIMENT
- OCR text (read all visible text in the video)
- Trope Stacks (e.g. "Before vs After", "Zero-Prep Solution", "Hidden Problem", "Expert Explains", "Life Hack")
- Music / Audio (BPM estimate, emotional tone)
- Cut pacing (slow / medium / fast)
- Voice Transcript
- Problem / Solution Phrases

LAYER 3 — BEHAVIORAL PATTERN MATCHING (Predictive Intent)
- Does the creative appeal to Slow Scrollers (minimalist, storytelling) or Fast Scrollers (bold text, high motion)?
- Predictive Intent: research / compare / solve a problem / impulse purchase
- Creative Similarity Score (Andromeda Filter) — score 1-100 vs historically high-performing ads

LAYER 4 — FUNNEL SEQUENCE PLACEMENT
- Viewer Archetype: The Skeptic (needs social proof) / The Researcher (needs explanation) / The Impulse Buyer (reacts to fast offers)
- Sequence Order: 1st Touch / 2nd Touch / 3rd Touch
- Social proof density
- Conversion window
- Funnel stage

OUTPUT FORMAT — CRITICAL:
Return ONE SINGLE LINE of values separated by the pipe character |.
No headers, no labels, no explanations, no preamble, no quotation marks around values, no newlines inside values.
Order the values exactly as columns A-Z below. If a value is unknown, write "—" (em dash). Never leave a column empty.

A: Filename
B: Visual Entity ID
C: Visual Setting
D: Persona Age/Style
E: Persona Energy
F: Product Fingerprint
G: Implicit Category
H: OCR Text
I: Trope Stack
J: Audio BPM/Vibe
K: Cut Pace
L: Voice Transcript
M: Problem/Solution Phrases
N: Predictive Intent
O: Aesthetic Scroll Correlation
P: Historical Sequence
Q: Andromeda Score
R: Fatigue Risk
S: Sequence Order
T: User Archetype
U: Social Proof Density
V: Conversion Window
W: Target Age
X: Target Lifestyle
Y: Target Behavior
Z: Final Funnel Stage

Output ONLY the single pipe-separated row. Nothing else.`

exports.handler = async (event, context) => {
  const pre = preflight(event)
  if (pre) return pre
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' })

  const auth = requireAuth(event, context)
  if (auth.errorResponse) return auth.errorResponse
  const { user } = auth

  if (!process.env.GEMINI_API_KEY) {
    return respond(500, { error: 'Server missing GEMINI_API_KEY' })
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return respond(500, { error: 'Server missing Supabase env vars' })
  }

  let payload
  try { payload = JSON.parse(event.body || '{}') }
  catch { return respond(400, { error: 'Invalid JSON body' }) }

  const { mode, youtubeUrl, fileUri, mimeType, filename } = payload

  if (mode !== 'youtube' && mode !== 'upload') {
    return respond(400, { error: 'mode must be "youtube" or "upload"' })
  }

  // Build video part
  let videoPart
  let sourceLabel
  if (mode === 'youtube') {
    if (!youtubeUrl || !isValidYouTubeUrl(youtubeUrl)) {
      return respond(400, { error: 'Invalid YouTube URL' })
    }
    videoPart = { fileData: { fileUri: youtubeUrl, mimeType: 'video/mp4' } }
    sourceLabel = youtubeUrl
  } else {
    if (!fileUri) {
      return respond(400, { error: 'Missing fileUri for upload mode. Upload the file to Google first via /api/create-upload.' })
    }

    // Gemini requires the uploaded file to be in ACTIVE state before analysis.
    // We poll briefly (up to ~25s) to give processing time. Most MP4s go active
    // within a few seconds; large or complex videos may take longer.
    try {
      await waitForFileActive(fileUri, process.env.GEMINI_API_KEY)
    } catch (err) {
      return respond(504, {
        error: `File not ready for analysis: ${err.message}. Try again in a moment.`
      })
    }

    videoPart = { fileData: { fileUri, mimeType: mimeType || 'video/mp4' } }
    sourceLabel = filename || 'uploaded-video'
  }

  // Call Gemini
  const geminiBody = {
    contents: [
      { role: 'user', parts: [videoPart, { text: GEM_PROMPT }] }
    ],
    generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
  }

  let gemRow
  let usage
  try {
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody)
    })
    const data = await res.json()
    if (!res.ok) {
      return respond(res.status, {
        error: data?.error?.message || 'Gemini API error',
        details: data?.error
      })
    }
    const candidates = data?.candidates || []
    if (!candidates.length) {
      return respond(502, {
        error: 'Gemini returned no candidates. May have been blocked by safety filters.'
      })
    }
    const parts = candidates[0]?.content?.parts || []
    const raw = parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('').trim()

    gemRow = raw
      .replace(/```[\w]*\n?/g, '')
      .replace(/```/g, '')
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.includes('|')) || raw

    usage = data?.usageMetadata
  } catch (err) {
    return respond(500, { error: err.message || 'Gemini request failed' })
  }

  // Insert into Supabase
  try {
    const inserted = await supabaseRequest('/analyses', {
      method: 'POST',
      body: JSON.stringify([{
        source: mode,
        source_label: sourceLabel,
        gem_row: gemRow,
        copy_generations: [],
        created_by_id: user.id,
        created_by_email: user.email,
        usage_metadata: usage || null
      }])
    })
    const record = Array.isArray(inserted) ? inserted[0] : inserted
    return respond(200, { record })
  } catch (err) {
    return respond(500, { error: `DB insert failed: ${err.message}` })
  }
}

function isValidYouTubeUrl(url) {
  try {
    const u = new URL(url)
    return /(^|\.)youtube\.com$/.test(u.hostname) || u.hostname === 'youtu.be'
  } catch { return false }
}

async function waitForFileActive(fileUri, apiKey) {
  // fileUri looks like: https://generativelanguage.googleapis.com/v1beta/files/abc123
  // We poll the same URL to check state.
  const maxAttempts = 12
  const delayMs = 2000

  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${fileUri}?key=${apiKey}`)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`status check failed: ${text.slice(0, 200)}`)
    }
    const data = await res.json()
    if (data.state === 'ACTIVE') return data
    if (data.state === 'FAILED') {
      throw new Error('Google failed to process the video')
    }
    await new Promise((r) => setTimeout(r, delayMs))
  }
  throw new Error('timeout waiting for video to become active')
}
