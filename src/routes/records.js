import { respond, supabaseRequest } from '../lib/http.js'

export async function handleRecords(request, env, user) {
  const url = new URL(request.url)

  if (request.method === 'GET') {
    const records = await supabaseRequest(env, '/analyses?select=*&order=created_at.desc&limit=200')
    return respond(env, 200, { records: records || [] })
  }

  if (request.method === 'DELETE') {
    const id = url.searchParams.get('id')
    if (!id) return respond(env, 400, { error: 'Missing id query param' })
    await supabaseRequest(env, `/analyses?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      prefer: 'return=minimal'
    })
    return respond(env, 200, { success: true })
  }

  return respond(env, 405, { error: 'Method not allowed' })
}
