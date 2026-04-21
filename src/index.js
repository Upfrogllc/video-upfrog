// gem-analyzer-api — Cloudflare Worker
// Routes:
//   POST   /analyze-video   (Gemini video analysis)
//   POST   /generate-copy   (OpenAI ad copy)
//   GET    /records         (list analyses)
//   DELETE /records?id=xxx
//   GET    /clients         (list clients)
//   POST   /clients         (create)
//   PATCH  /clients?id=xxx  (update)
//   DELETE /clients?id=xxx  (archive)
//
// Auth: Netlify Identity JWT via Authorization: Bearer <token>
// Upload limit: 100MB (Workers Paid plan)

import { handleAnalyzeVideo } from './routes/analyze-video.js'
import { handleGenerateCopy } from './routes/generate-copy.js'
import { handleRecords } from './routes/records.js'
import { handleClients } from './routes/clients.js'
import { verifyNetlifyJWT } from './lib/auth.js'
import { corsHeaders, respond } from './lib/http.js'

export default {
  async fetch(request, env, ctx) {
    // CORS preflight — must allow any origin-origin request before auth check
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) })
    }

    const url = new URL(request.url)
    const path = url.pathname

    // Health check (unauthenticated)
    if (path === '/' || path === '/health') {
      return respond(env, 200, { status: 'ok', service: 'gem-analyzer-api' })
    }

    // Everything else requires a valid Netlify Identity JWT
    let user
    try {
      user = await verifyNetlifyJWT(request, env)
    } catch (err) {
      return respond(env, 401, { error: `Auth failed: ${err.message}` })
    }

    try {
      if (path === '/analyze-video') return handleAnalyzeVideo(request, env, user)
      if (path === '/generate-copy') return handleGenerateCopy(request, env, user)
      if (path === '/records') return handleRecords(request, env, user)
      if (path === '/clients') return handleClients(request, env, user)
      return respond(env, 404, { error: 'Not found' })
    } catch (err) {
      console.error('Route error:', err)
      return respond(env, 500, { error: err.message || 'Internal error' })
    }
  }
}
