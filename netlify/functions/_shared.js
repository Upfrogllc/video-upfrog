// Shared helpers used by all Netlify functions.

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
  }
}

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  }
}

function preflight(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' }
  }
  return null
}

/**
 * Extract the authenticated user from the Netlify Identity context.
 * Netlify automatically verifies the JWT and populates context.clientContext.user
 * when the Authorization header contains a valid token from this site's Identity instance.
 * Returns { user } on success or { errorResponse } if not authenticated.
 */
function requireAuth(event, context) {
  const user = context?.clientContext?.user
  if (!user) {
    return {
      errorResponse: respond(401, {
        error: 'Not authenticated. Sign in with Netlify Identity.'
      })
    }
  }
  return {
    user: {
      id: user.sub,
      email: user.email,
      roles: user.app_metadata?.roles || []
    }
  }
}

/**
 * Minimal Supabase REST client using fetch. We use the service_role key because
 * functions run server-side and we're enforcing auth ourselves via Netlify Identity.
 */
async function supabaseRequest(path, options = {}) {
  const url = `${process.env.SUPABASE_URL}/rest/v1${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {})
    }
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${text}`)
  }
  return text ? JSON.parse(text) : null
}

module.exports = {
  corsHeaders,
  respond,
  preflight,
  requireAuth,
  supabaseRequest
}
