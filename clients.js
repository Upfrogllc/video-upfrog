// GET    /api/clients              → { clients: [...] }  (excludes archived by default)
// GET    /api/clients?includeArchived=1 → includes archived
// POST   /api/clients              → { client }  (body: { business_name, location, vertical, tone_voice, notes })
// PATCH  /api/clients?id=xxx       → { client }  (body: fields to update)
// DELETE /api/clients?id=xxx       → { success: true }  (soft delete — sets archived=true)
// DELETE /api/clients?id=xxx&hard=1 → { success: true }  (hard delete — permanent)

const { respond, preflight, requireAuth, supabaseRequest } = require('./_shared.js')

const ALLOWED_FIELDS = ['business_name', 'location', 'vertical', 'tone_voice', 'notes']

exports.handler = async (event, context) => {
  const pre = preflight(event)
  if (pre) return pre

  const auth = requireAuth(event, context)
  if (auth.errorResponse) return auth.errorResponse
  const { user } = auth

  const method = event.httpMethod
  const qs = event.queryStringParameters || {}

  // GET: list all clients
  if (method === 'GET') {
    try {
      const archivedFilter = qs.includeArchived === '1' ? '' : '&archived=eq.false'
      const clients = await supabaseRequest(
        `/clients?select=*${archivedFilter}&order=business_name.asc&limit=500`
      )
      return respond(200, { clients: clients || [] })
    } catch (err) {
      return respond(500, { error: err.message })
    }
  }

  // POST: create a new client
  if (method === 'POST') {
    let body
    try { body = JSON.parse(event.body || '{}') }
    catch { return respond(400, { error: 'Invalid JSON body' }) }

    if (!body.business_name || typeof body.business_name !== 'string') {
      return respond(400, { error: 'business_name is required' })
    }
    const record = pickFields(body)
    record.business_name = body.business_name.trim()
    record.created_by_email = user.email

    try {
      const rows = await supabaseRequest('/clients', {
        method: 'POST',
        body: JSON.stringify([record])
      })
      const client = Array.isArray(rows) ? rows[0] : rows
      return respond(200, { client })
    } catch (err) {
      return respond(500, { error: err.message })
    }
  }

  // PATCH: update a client
  if (method === 'PATCH') {
    const id = qs.id
    if (!id) return respond(400, { error: 'Missing id query param' })
    let body
    try { body = JSON.parse(event.body || '{}') }
    catch { return respond(400, { error: 'Invalid JSON body' }) }

    const update = pickFields(body)
    // Allow unarchiving via PATCH too
    if (typeof body.archived === 'boolean') update.archived = body.archived

    if (Object.keys(update).length === 0) {
      return respond(400, { error: 'No updatable fields provided' })
    }

    try {
      const rows = await supabaseRequest(
        `/clients?id=eq.${encodeURIComponent(id)}`,
        { method: 'PATCH', body: JSON.stringify(update) }
      )
      const client = Array.isArray(rows) ? rows[0] : rows
      if (!client) return respond(404, { error: 'Client not found' })
      return respond(200, { client })
    } catch (err) {
      return respond(500, { error: err.message })
    }
  }

  // DELETE: soft (default) or hard delete
  if (method === 'DELETE') {
    const id = qs.id
    if (!id) return respond(400, { error: 'Missing id query param' })
    const hard = qs.hard === '1'

    try {
      if (hard) {
        await supabaseRequest(
          `/clients?id=eq.${encodeURIComponent(id)}`,
          { method: 'DELETE', prefer: 'return=minimal' }
        )
      } else {
        await supabaseRequest(
          `/clients?id=eq.${encodeURIComponent(id)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ archived: true })
          }
        )
      }
      return respond(200, { success: true })
    } catch (err) {
      return respond(500, { error: err.message })
    }
  }

  return respond(405, { error: 'Method not allowed' })
}

function pickFields(body) {
  const out = {}
  for (const f of ALLOWED_FIELDS) {
    if (typeof body[f] === 'string') {
      out[f] = body[f].trim() || null
    } else if (body[f] === null) {
      out[f] = null
    }
  }
  return out
}
