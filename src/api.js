// All calls to /api/* go through here so we always attach the Identity JWT.

import netlifyIdentity from 'netlify-identity-widget'

async function authFetch(path, opts = {}) {
  const user = netlifyIdentity.currentUser()
  if (!user) throw new Error('Not signed in')
  const token = await user.jwt()

  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`
    }
  })

  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }

  if (!res.ok) {
    throw new Error(data?.error || `${res.status} ${res.statusText}`)
  }
  return data
}

export const api = {
  // Step 1 of upload: get a Google resumable upload URL
  createUpload: ({ filename, mimeType, sizeBytes }) =>
    authFetch('/api/create-upload', {
      method: 'POST',
      body: JSON.stringify({ filename, mimeType, sizeBytes })
    }),

  // Video analyses
  analyzeVideo: ({ mode, youtubeUrl, fileUri, mimeType, filename }) =>
    authFetch('/api/analyze-video', {
      method: 'POST',
      body: JSON.stringify({ mode, youtubeUrl, fileUri, mimeType, filename })
    }),

  generateCopy: ({ recordId, clientId, model }) =>
    authFetch('/api/generate-copy', {
      method: 'POST',
      body: JSON.stringify({ recordId, clientId, model })
    }),

  listRecords: () => authFetch('/api/records'),

  deleteRecord: (id) =>
    authFetch(`/api/records?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Clients
  listClients: ({ includeArchived = false } = {}) =>
    authFetch(`/api/clients${includeArchived ? '?includeArchived=1' : ''}`),

  createClient: (fields) =>
    authFetch('/api/clients', {
      method: 'POST',
      body: JSON.stringify(fields)
    }),

  updateClient: (id, fields) =>
    authFetch(`/api/clients?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(fields)
    }),

  archiveClient: (id) =>
    authFetch(`/api/clients?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}
