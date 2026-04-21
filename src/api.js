import netlifyIdentity from 'netlify-identity-widget'

// Set this in Netlify env vars: VITE_API_BASE = https://gem-analyzer-api.<your-sub>.workers.dev
const API_BASE = import.meta.env.VITE_API_BASE || ''

async function authFetch(path, opts = {}) {
  const user = netlifyIdentity.currentUser()
  if (!user) throw new Error('Not signed in')
  const token = await user.jwt()

  const isFormData = opts.body instanceof FormData
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`
    }
  })

  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
  if (!res.ok) throw new Error(data?.error || `${res.status} ${res.statusText}`)
  return data
}

export const api = {
  analyzeVideoYouTube: (youtubeUrl) =>
    authFetch('/analyze-video', {
      method: 'POST',
      body: JSON.stringify({ mode: 'youtube', youtubeUrl })
    }),

  analyzeVideoUpload: (file, onProgress) => {
    // Use XHR for upload progress. Gets Identity token first.
    return new Promise(async (resolve, reject) => {
      try {
        const user = netlifyIdentity.currentUser()
        if (!user) return reject(new Error('Not signed in'))
        const token = await user.jwt()

        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${API_BASE}/analyze-video`)
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress(Math.round((e.loaded / e.total) * 100))
          }
        }

        xhr.onload = () => {
          let data
          try { data = JSON.parse(xhr.responseText) } catch { data = { error: xhr.responseText } }
          if (xhr.status >= 200 && xhr.status < 300) resolve(data)
          else reject(new Error(data?.error || `${xhr.status}`))
        }
        xhr.onerror = () => reject(new Error('Network error'))

        const form = new FormData()
        form.append('file', file)
        form.append('filename', file.name)
        form.append('mimeType', file.type || 'video/mp4')
        xhr.send(form)
      } catch (err) {
        reject(err)
      }
    })
  },

  generateCopy: ({ recordId, clientId, model }) =>
    authFetch('/generate-copy', {
      method: 'POST',
      body: JSON.stringify({ recordId, clientId, model })
    }),

  listRecords: () => authFetch('/records'),
  deleteRecord: (id) => authFetch(`/records?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listClients: ({ includeArchived = false } = {}) =>
    authFetch(`/clients${includeArchived ? '?includeArchived=1' : ''}`),
  createClient: (fields) =>
    authFetch('/clients', { method: 'POST', body: JSON.stringify(fields) }),
  updateClient: (id, fields) =>
    authFetch(`/clients?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(fields) }),
  archiveClient: (id) =>
    authFetch(`/clients?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}
