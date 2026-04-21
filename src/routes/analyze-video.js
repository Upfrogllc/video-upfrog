// POST /analyze-video
// Handles both YouTube URLs (passed as string) and file uploads (multipart/form-data).
// For file uploads, we stream the video to Google's File API, poll for ACTIVE state,
// then call Gemini with the fileUri. Video bytes never touch Supabase or Netlify.

import { respond, supabaseRequest } from '../lib/http.js'

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

export async function handleAnalyzeVideo(request, env, user) {
  if (request.method !== 'POST') return respond(env, 405, { error: 'Method not allowed' })

  const contentType = request.headers.get('Content-Type') || ''

  let mode, youtubeUrl, fileBlob, filename, mimeType

  if (contentType.includes('multipart/form-data')) {
    // File upload path
    const form = await request.formData()
    mode = 'upload'
    fileBlob = form.get('file')
    filename = form.get('filename') || fileBlob?.name || 'upload.mp4'
    mimeType = form.get('mimeType') || fileBlob?.type || 'video/mp4'
    if (!fileBlob || typeof fileBlob === 'string') {
      return respond(env, 400, { error: 'Missing file in form data' })
    }
  } else {
    // JSON path (YouTube URL)
    let body
    try { body = await request.json() }
    catch { return respond(env, 400, { error: 'Invalid JSON' }) }
    mode = body.mode
    youtubeUrl = body.youtubeUrl
    if (mode !== 'youtube') {
      return respond(env, 400, { error: 'JSON body must have mode: "youtube". Use multipart form for uploads.' })
    }
    if (!youtubeUrl || !isValidYouTubeUrl(youtubeUrl)) {
      return respond(env, 400, { error: 'Invalid YouTube URL' })
    }
  }

  // Build the Gemini video part
  let videoPart, sourceLabel
  if (mode === 'youtube') {
    videoPart = { fileData: { fileUri: youtubeUrl, mimeType: 'video/mp4' } }
    sourceLabel = youtubeUrl
  } else {
    // Upload video to Gemini File API
    const fileUri = await uploadToGeminiFileAPI(env, fileBlob, filename, mimeType)
    // Poll until ACTIVE
    await waitForFileActive(fileUri, env.GEMINI_API_KEY)
    videoPart = { fileData: { fileUri, mimeType } }
    sourceLabel = filename
  }

  // Call Gemini 2.5 Pro
  const geminiBody = {
    contents: [{ role: 'user', parts: [videoPart, { text: GEM_PROMPT }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
  }

  const geminiRes = await fetch(`${GEMINI_ENDPOINT}?key=${env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(geminiBody)
  })
  const geminiData = await geminiRes.json()
  if (!geminiRes.ok) {
    return respond(env, geminiRes.status, {
      error: geminiData?.error?.message || 'Gemini error',
      details: geminiData?.error
    })
  }

  const candidates = geminiData?.candidates || []
  if (!candidates.length) {
    return respond(env, 502, { error: 'Gemini returned no candidates' })
  }

  const parts = candidates[0]?.content?.parts || []
  const raw = parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('').trim()
  const gemRow = raw
    .replace(/```[\w]*\n?/g, '')
    .replace(/```/g, '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.includes('|')) || raw

  // Persist to Supabase
  const inserted = await supabaseRequest(env, '/analyses', {
    method: 'POST',
    body: JSON.stringify([{
      source: mode,
      source_label: sourceLabel,
      gem_row: gemRow,
      copy_generations: [],
      created_by_id: user.id,
      created_by_email: user.email,
      usage_metadata: geminiData?.usageMetadata || null
    }])
  })

  const record = Array.isArray(inserted) ? inserted[0] : inserted
  return respond(env, 200, { record })
}

// Upload a file to Gemini using the resumable protocol
async function uploadToGeminiFileAPI(env, fileBlob, filename, mimeType) {
  const sizeBytes = fileBlob.size
  const displayName = filename.replace(/[^\w.\-]/g, '_').slice(0, 200)

  // Step 1: start resumable upload
  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(sizeBytes),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ file: { display_name: displayName } })
    }
  )
  if (!startRes.ok) {
    const text = await startRes.text()
    throw new Error(`File upload init failed: ${text.slice(0, 300)}`)
  }

  const uploadUrl = startRes.headers.get('x-goog-upload-url')
  if (!uploadUrl) throw new Error('No upload URL returned from Google')

  // Step 2: upload the bytes in one shot (Worker handles streaming)
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(sizeBytes),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize'
    },
    body: fileBlob.stream()
  })
  if (!uploadRes.ok) {
    const text = await uploadRes.text()
    throw new Error(`File upload failed: ${text.slice(0, 300)}`)
  }

  const uploadData = await uploadRes.json()
  const fileUri = uploadData?.file?.uri
  if (!fileUri) throw new Error('No fileUri in upload response')
  return fileUri
}

async function waitForFileActive(fileUri, apiKey) {
  const maxAttempts = 15
  const delayMs = 2000
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(`${fileUri}?key=${apiKey}`)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`File status check failed: ${text.slice(0, 200)}`)
    }
    const data = await res.json()
    if (data.state === 'ACTIVE') return data
    if (data.state === 'FAILED') throw new Error('Google failed to process the video')
    await new Promise((r) => setTimeout(r, delayMs))
  }
  throw new Error('Timeout waiting for video to become active')
}

function isValidYouTubeUrl(url) {
  try {
    const u = new URL(url)
    return /(^|\.)youtube\.com$/.test(u.hostname) || u.hostname === 'youtu.be'
  } catch { return false }
}
