// Verifies Netlify Identity JWTs using their JWKS endpoint.
// Caches the keys in-memory per-isolate for speed.

let jwksCache = null
let jwksCacheTime = 0
const JWKS_CACHE_MS = 60 * 60 * 1000 // 1 hour

export async function verifyNetlifyJWT(request, env) {
  const authHeader = request.headers.get('Authorization') || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new Error('Missing Authorization header')

  const [headerB64, payloadB64, signatureB64] = token.split('.')
  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new Error('Malformed JWT')
  }

  const header = JSON.parse(atob(b64urlToB64(headerB64)))
  const payload = JSON.parse(atob(b64urlToB64(payloadB64)))

  // Check expiration
  const now = Math.floor(Date.now() / 1000)
  if (payload.exp && payload.exp < now) {
    throw new Error('Token expired')
  }

  // Fetch JWKS for this Netlify site
  const jwks = await getJWKS(env)
  const key = jwks.keys.find((k) => k.kid === header.kid)
  if (!key) throw new Error('Signing key not found in JWKS')

  // Verify signature using WebCrypto
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    { kty: key.kty, n: key.n, e: key.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  )

  const signatureBytes = b64urlToUint8(signatureB64)
  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`)

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signatureBytes,
    signedData
  )
  if (!valid) throw new Error('Invalid signature')

  return {
    id: payload.sub,
    email: payload.email,
    roles: payload.app_metadata?.roles || []
  }
}

async function getJWKS(env) {
  const now = Date.now()
  if (jwksCache && now - jwksCacheTime < JWKS_CACHE_MS) {
    return jwksCache
  }

  if (!env.NETLIFY_SITE_ID) {
    throw new Error('NETLIFY_SITE_ID not configured')
  }

  // Netlify Identity JWKS endpoint format
  const jwksUrl = `https://api.netlify.com/.netlify/identity/${env.NETLIFY_SITE_ID}/.well-known/jwks.json`
  const res = await fetch(jwksUrl)
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`)
  jwksCache = await res.json()
  jwksCacheTime = now
  return jwksCache
}

function b64urlToB64(s) {
  return s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - s.length % 4) % 4, '=')
}

function b64urlToUint8(s) {
  const b64 = b64urlToB64(s)
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
