import { respond, supabaseRequest } from '../lib/http.js'

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

Use the GEM analysis to understand what made the source video work. Then write new Meta ad copy for ${client.business_name} that leverages those same psychological levers — naturally fitting the client's location, vertical, and voice.

Rules:
- Mention the business name and location naturally where it strengthens the ad
- Match the tone/voice guidance above
- Do NOT copy the source creative verbatim — reinterpret its emotional structure
- Focus on emotional relatability, behavioral triggers, pattern interrupt, curiosity loops, shareability, persuasion
- Feel natural, human, and story-driven

Write FIVE versions of ad copy AND FIVE headline variations.

OUTPUT FORMAT — CRITICAL:
Return valid JSON only. No markdown code fences, no preamble. Use this exact shape:

{
  "super_long_form": "...",
  "long_form": "...",
  "medium_form": "...",
  "short_form": "...",
  "ultra_short": "...",
  "headlines": ["H1", "H2", "H3", "H4", "H5"]
}

HEADLINE RULES: max 8 words each, must trigger curiosity/persuasion/peer pressure. Use curiosity gaps, contrarian statements, social proof hints, or emotional triggers.

Return ONLY the JSON object.`
}

export async function handleGenerateCopy(request, env, user) {
  if (request.method !== 'POST') return respond(env, 405, { error: 'Method not allowed' })

  let body
  try { body = await request.json() }
  catch { return respond(env, 400, { error: 'Invalid JSON' }) }

  const { recordId, clientId, model } = body
  if (!recordId) return respond(env, 400, { error: 'recordId is required' })
  if (!clientId) return respond(env, 400, { error: 'clientId is required' })
  if (!model || !ALLOWED_MODELS.has(model)) {
    return respond(env, 400, { error: `Invalid model. Allowed: ${[...ALLOWED_MODELS].join(', ')}` })
  }

  const analysisRows = await supabaseRequest(env, `/analyses?id=eq.${encodeURIComponent(recordId)}&select=*`)
  const analysis = Array.isArray(analysisRows) ? analysisRows[0] : analysisRows
  if (!analysis) return respond(env, 404, { error: 'Analysis not found' })

  const clientRows = await supabaseRequest(env, `/clients?id=eq.${encodeURIComponent(clientId)}&select=*`)
  const client = Array.isArray(clientRows) ? clientRows[0] : clientRows
  if (!client) return respond(env, 404, { error: 'Client not found' })

  const prompt = buildAdCopyPrompt({
    gemRow: analysis.gem_row,
    sourceLabel: analysis.source_label,
    client
  })

  const openaiRes = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a world-class Meta ad copywriter. You follow output format instructions exactly and return only valid JSON when asked.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.85,
      response_format: { type: 'json_object' }
    })
  })

  const data = await openaiRes.json()
  if (!openaiRes.ok) {
    return respond(env, openaiRes.status, { error: data?.error?.message || 'OpenAI error' })
  }

  const content = data?.choices?.[0]?.message?.content || ''
  let adCopy
  try { adCopy = JSON.parse(content) }
  catch (e) {
    return respond(env, 502, { error: `Invalid JSON from OpenAI: ${e.message}`, raw: content.slice(0, 500) })
  }

  const generation = {
    id: crypto.randomUUID(),
    client_id: client.id,
    client_name: client.business_name,
    client_location: client.location || null,
    client_vertical: client.vertical || null,
    model,
    created_at: new Date().toISOString(),
    created_by_email: user.email,
    usage: data?.usage || null,
    super_long_form: adCopy.super_long_form || '',
    long_form: adCopy.long_form || '',
    medium_form: adCopy.medium_form || '',
    short_form: adCopy.short_form || '',
    ultra_short: adCopy.ultra_short || '',
    headlines: Array.isArray(adCopy.headlines) ? adCopy.headlines.slice(0, 10) : []
  }

  const existing = Array.isArray(analysis.copy_generations) ? analysis.copy_generations : []
  const updated = [generation, ...existing]

  const updatedRow = await supabaseRequest(env, `/analyses?id=eq.${encodeURIComponent(recordId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ copy_generations: updated })
  })
  const record = Array.isArray(updatedRow) ? updatedRow[0] : updatedRow
  return respond(env, 200, { record, generation })
}
