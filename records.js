// GET  /api/records           → { records: [...] }   (everyone sees everything)
// DELETE /api/records?id=xxx  → { success: true }
// Auth: Netlify Identity JWT required on both

const { respond, preflight, requireAuth, supabaseRequest } = require('./_shared.js')

exports.handler = async (event, context) => {
  const pre = preflight(event)
  if (pre) return pre

  const auth = requireAuth(event, context)
  if (auth.errorResponse) return auth.errorResponse

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return respond(500, { error: 'Server missing Supabase env vars' })
  }

  if (event.httpMethod === 'GET') {
    try {
      const records = await supabaseRequest(
        '/analyses?select=*&order=created_at.desc&limit=200'
      )
      return respond(200, { records: records || [] })
    } catch (err) {
      return respond(500, { error: err.message })
    }
  }

  if (event.httpMethod === 'DELETE') {
    const id = event.queryStringParameters?.id
    if (!id) return respond(400, { error: 'Missing id query param' })
    try {
      await supabaseRequest(
        `/analyses?id=eq.${encodeURIComponent(id)}`,
        { method: 'DELETE', prefer: 'return=minimal' }
      )
      return respond(200, { success: true })
    } catch (err) {
      return respond(500, { error: err.message })
    }
  }

  return respond(405, { error: 'Method not allowed' })
}
