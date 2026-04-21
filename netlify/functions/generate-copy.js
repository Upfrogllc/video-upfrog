// POST /api/generate-copy
// Body: { recordId, clientId, model }
// Auth: Netlify Identity JWT required
// Returns: { record, generation }  — record has updated copy_generations array
//
// Flow:
//   1. Fetch the analysis record (for its gem_row)
//   2. Fetch the client (for brand context)
//   3. Build a context-heavy prompt and call OpenAI with the chosen model
//   4. Parse the JSON response into a generation object
//   5. Append to the record's copy_generations array and save

const { respond, preflight, requireAuth, supabaseRequest } = require('./_shared.js')
const crypto = require('crypto')

const ALLOWED_MODELS = new Set(['gpt-5.4', 'gpt-5.4-mini', 'gpt-4.1', 'gpt-4o'])
const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions'

function buildAdCopyPrompt({ gemRow, sourceLabel, client }) {
  return `You are a world-class emotional and relatable Meta ad copywriter specializing in behavioral psychology, scroll-stopping advertising, viral ad mechanics, and high-conversion Meta ad copy.

You write white-label Meta ad copy for local service businesses. Your job is to take a winning creative's psychological analysis and rewrite the copy specifically for the client brand below, keeping the underlying emotional hooks while personalizing voice, geography, and positioning.

CLIENT BRAND:
- Business name: ${client.business_name}
- Location / service area: ${client.location || '(not specified)'}
- Vertical / industry: ${client.vertical || '(not specified)'}
- Tone / voice: ${client.tone_voice || '(no specific guidance — use a natural, human, conversational tone)'}${client.notes ? `\n- Extra notes: ${client.notes}` : ''}

GEM ANALYSIS of the source creative (pipe-separated, columns A-Z):
${gemRow}

ORIGINAL SOURCE: ${sourceLabel}

Use the GEM analysis to understand what made the source video work (the persona energy, tropes, predictive intent, funnel placement, user archetype). Then write new Meta ad copy for ${client.business_name} that leverages those same psychological levers — but naturally fits the client's location, vertical, and voice.

Rules:
- Mention the business name and location naturally where it strengthens the ad (not forced into every version)
- Match the tone/voice guidance above
- Do NOT copy the source creative verbatim — reinterpret its emotional structure for this brand
- Focus on emotional relatability, behavioral triggers, pattern interrupt, curiosity loops, shareability, persuasion
- Feel natural, human, and story-driven

Write FIVE versions of ad copy AND FIVE headline variations.

OUTPUT FORMAT — CRITICAL:
Return valid JSON only. No markdown code fences, no preamble. Use this exact shape:

{
  "super_long_form": "story-driven, highly emotional, narrative structure...",
  "long_form": "problem -> agitation -> solution, conversational tone...",
  "medium_form": "fast readability, emotional trigger, clear CTA...",
  "short_form": "direct persuasion, punchy language...",
  "ultra_short": "minimal words, maximum curiosity...",
  "headlines": [
    "Headline 1",
    "Headline 2",
    "Headline 3",
    "Headline 4",
    "Headline 5"
  ]
}

HEADLINE RULES: max 8 words each, must trigger curiosity / persuasion / peer pressure — designed for Meta ad click-through. Use curiosity gaps, contrarian statements, social proof hints, or emotional triggers.

Return ONLY the JSON object.`
}

exports.handler = async (event, context) => {
  const pre = preflight(event)
  if (pre) return pre
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' })

  const auth = requireAuth(event, context)
  if (auth.errorResponse) return auth.errorResponse
  const { user } = auth

  if (!process.env.OPENAI_API_KEY) {
    return respond(500, { error: 'Server missing OPENAI_API_KEY' })
  }

  let payload
  try { payload = JSON.parse(event.body || '{}') }
  catch { return respond(400, { error: 'Invalid JSON body' }) }

  const { recordId, clientId, model } = payload
  if (!recordId) return respond(400, { error: 'recordId is required' })
  if (!clientId) return respond(400, { error: 'clientId is required' })
  if (!model || !ALLOWED_MODELS.has(model)) {
    return respond(400, { error: `Invalid model. Allowed: ${[...ALLOWED_MODELS].join(', ')}` })
  }

  // Fetch the analysis
  let analysis
  try {
    const rows = await supabaseRequest(
      `/analyses?id=eq.${encodeURIComponent(recordId)}&select=*`
    )
    analysis = Array.isArray(rows) ? rows[0] : rows
  } catch (err) {
    return respond(500, { error: `DB lookup failed: ${err.message}` })
  }
  if (!analysis) return respond(404, { error: 'Analysis not found' })

  // Fetch the client
  let client
  try {
    const rows = await supabaseRequest(
      `/clients?id=eq.${encodeURIComponent(clientId)}&select=*`
    )
    client = Array.isArray(rows) ? rows[0] : rows
  } catch (err) {
    return respond(500, { error: `Client lookup failed: ${err.message}` })
  }
  if (!client) return respond(404, { error: 'Client not found' })

  // Call OpenAI
  const prompt = buildAdCopyPrompt({
    gemRow: analysis.gem_row,
    sourceLabel: analysis.source_label,
    client
  })

  let adCopy
  let usage
  try {
    const res = await fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a world-class Meta ad copywriter. You follow output format instructions exactly and return only valid JSON when asked.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.85,
        response_format: { type: 'json_object' }
      })
    })

    const data = await res.json()
    if (!res.ok) {
      return respond(res.status, {
        error: data?.error?.message || 'OpenAI API error',
        details: data?.error
      })
    }

    const content = data?.choices?.[0]?.message?.content || ''
    usage = data?.usage

    try {
      adCopy = JSON.parse(content)
    } catch (parseErr) {
      return respond(502, {
        error: `OpenAI returned invalid JSON: ${parseErr.message}`,
        raw: content.slice(0, 500)
      })
    }
  } catch (err) {
    return respond(500, { error: err.message || 'OpenAI request failed' })
  }

  // Build the generation object
  const generation = {
    id: crypto.randomUUID(),
    client_id: client.id,
    client_name: client.business_name,
    client_location: client.location || null,
    client_vertical: client.vertical || null,
    model,
    created_at: new Date().toISOString(),
    created_by_email: user.email,
    usage: usage || null,
    super_long_form: adCopy.super_long_form || '',
    long_form: adCopy.long_form || '',
    medium_form: adCopy.medium_form || '',
    short_form: adCopy.short_form || '',
    ultra_short: adCopy.ultra_short || '',
    headlines: Array.isArray(adCopy.headlines) ? adCopy.headlines.slice(0, 10) : []
  }

  // Append to copy_generations array (newest first)
  const existingGenerations = Array.isArray(analysis.copy_generations)
    ? analysis.copy_generations
    : []
  const updatedGenerations = [generation, ...existingGenerations]

  // Save
  try {
    const updated = await supabaseRequest(
      `/analyses?id=eq.${encodeURIComponent(recordId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ copy_generations: updatedGenerations })
      }
    )
    const record = Array.isArray(updated) ? updated[0] : updated
    return respond(200, { record, generation })
  } catch (err) {
    return respond(500, { error: `DB update failed: ${err.message}` })
  }
}
