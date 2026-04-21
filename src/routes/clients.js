import { respond, supabaseRequest } from '../lib/http.js'

const ALLOWED_FIELDS = ['business_name', 'location', 'vertical', 'tone_voice', 'notes']

export async function handleClients(request, env, user) {
  const url = new URL(request.url)
  const qs = url.searchParams
  const method = request.method

  if (method === 'GET') {
    const archivedFilter = qs.get('includeArchived') === '1' ? '' : '&archived=eq.false'
    const clients = await supabaseRequest(
      env,
      `/clients?select=*${archivedFilter}&order=business_name.asc&limit=500`
    )
    return respond(env, 200, { clients: clients || [] })
  }

  if (method === 'POST') {
    let body
    try { body = await request.json() }
    catch { return respond(env, 400, { error: 'Invalid JSON' }) }
    if (!body.business_name || typeof body.business_name !== 'string') {
      return respond(env, 400, { error: 'business_name is required' })
    }
    const record = pickFields(body)
    record.business_name = body.business_name.trim()
    record.created_by_email = user.email

    const rows = await supabaseRequest(env, '/clients', {
      method: 'POST',
      body: JSON.stringify([record])
    })
    return respond(env, 200, { client: Array.isArray(rows) ? rows[0] : rows })
  }

  if (method === 'PATCH') {
    const id = qs.get('id')
    if (!id) return respond(env, 400, { error: 'Missing id' })
    let body
    try { body = await request.json() }
    catch { return respond(env, 400, { error: 'Invalid JSON' }) }
    const update = pickFields(body)
    if (typeof body.archived === 'boolean') update.archived = body.archived
    if (!Object.keys(update).length) return respond(env, 400, { error: 'No updatable fields' })

    const rows = await supabaseRequest(env, `/clients?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(update)
    })
    return respond(env, 200, { client: Array.isArray(rows) ? rows[0] : rows })
  }

  if (method === 'DELETE') {
    const id = qs.get('id')
    if (!id) return respond(env, 400, { error: 'Missing id' })
    const hard = qs.get('hard') === '1'
    if (hard) {
      await supabaseRequest(env, `/clients?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        prefer: 'return=minimal'
      })
    } else {
      await supabaseRequest(env, `/clients?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: true })
      })
    }
    return respond(env, 200, { success: true })
  }

  return respond(env, 405, { error: 'Method not allowed' })
}

function pickFields(body) {
  const out = {}
  for (const f of ALLOWED_FIELDS) {
    if (typeof body[f] === 'string') out[f] = body[f].trim() || null
    else if (body[f] === null) out[f] = null
  }
  return out
}
