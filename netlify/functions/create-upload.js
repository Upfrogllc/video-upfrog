// POST /api/create-upload
// Body: { filename, mimeType, sizeBytes }
// Auth: Netlify Identity JWT required
// Returns: { uploadUrl, displayName }
//
// This function starts a resumable upload with Google's File API and returns
// the short-lived upload URL to the browser. The browser then uploads the
// video bytes directly to Google, bypassing Netlify's 6MB function limit.

const { respond, preflight, requireAuth } = require('./_shared.js')

exports.handler = async (event, context) => {
  const pre = preflight(event)
  if (pre) return pre
  if (event.httpMethod !== 'POST') return respond(405, { error: 'Method not allowed' })

  const auth = requireAuth(event, context)
  if (auth.errorResponse) return auth.errorResponse

  if (!process.env.GEMINI_API_KEY) {
    return respond(500, { error: 'Server missing GEMINI_API_KEY' })
  }

  let payload
  try { payload = JSON.parse(event.body || '{}') }
  catch { return respond(400, { error: 'Invalid JSON body' }) }

  const { filename, mimeType, sizeBytes } = payload

  if (!filename) return respond(400, { error: 'filename is required' })
  if (!mimeType) return respond(400, { error: 'mimeType is required' })
  if (!sizeBytes || typeof sizeBytes !== 'number') {
    return respond(400, { error: 'sizeBytes (number) is required' })
  }

  // Upper bound — Gemini files max out at 2GB
  const MAX_BYTES = 2 * 1024 * 1024 * 1024
  if (sizeBytes > MAX_BYTES) {
    return respond(400, { error: `File too large. Max 2GB.` })
  }

  const displayName = filename.replace(/[^\w.\-]/g, '_').slice(0, 200)

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${process.env.GEMINI_API_KEY}`,
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

    if (!res.ok) {
      const errText = await res.text()
      return respond(res.status, {
        error: `Google File API error: ${errText.slice(0, 300)}`
      })
    }

    const uploadUrl = res.headers.get('x-goog-upload-url')
    if (!uploadUrl) {
      return respond(502, { error: 'Google did not return an upload URL' })
    }

    return respond(200, { uploadUrl, displayName })
  } catch (err) {
    return respond(500, { error: err.message || 'Failed to initiate upload' })
  }
}
