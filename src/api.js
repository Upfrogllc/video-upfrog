// Simple password-based auth against the Cloudflare Worker.

const API_BASE = import.meta.env.VITE_API_BASE || ''
const PASSWORD_STORAGE_KEY = 'upfrog_gem_password'

export function getPassword() {
  return sessionStorage.getItem(PASSWORD_STORAGE_KEY) || ''
}
export function setPassword(pwd) {
  sessionStorage.setItem(PASSWORD_STORAGE_KEY, pwd)
}
export function clearPassword() {
  sessionStorage.removeItem(PASSWORD_STORAGE_KEY)
}

async function authFetch(path, opts = {}) {
  const pwd = getPassword()
  if (!pwd) throw new Error('Not signed in')

  const isFormData = opts.body instanceof FormData
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(opts.headers || {}),
      Authorization: `Bearer ${pwd}`
    }
  })

  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }

  if (res.status === 401) {
    clearPassword()
    throw new Error('Invalid password — please sign in again')
  }
  if (!res.ok) throw new Error(data?.error || `${res.status} ${res.statusText}`)
  return data
}

export const api = {
  verifyPassword: async (pwd) => {
    const res = await fetch(`${API_BASE}/records`, {
      headers: { Authorization: `Bearer ${pwd}` }
    })
    return res.status !== 401
  },

  analyzeVideoYouTube: (youtubeUrl) =>
    authFetch('/analyze-video', {
      method: 'POST',
      body: JSON.stringify({ mode: 'youtube', youtubeUrl })
    }),

  analyzeVideoUpload: (file, onProgress) => {
    return new Promise((resolve, reject) => {
      const pwd = getPassword()
      if (!pwd) return reject(new Error('Not signed in'))

      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${API_BASE}/analyze-video`)
      xhr.setRequestHeader('Authorization', `Bearer ${pwd}`)

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }

      xhr.onload = () => {
        let data
        try { data = JSON.parse(xhr.responseText) } catch { data = { error: xhr.responseText } }
        if (xhr.status === 401) {
          clearPassword()
          reject(new Error('Invalid password — please sign in again'))
        } else if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data)
        } else {
          reject(new Error(data?.error || `${xhr.status}`))
        }
      }
      xhr.onerror = () => reject(new Error('Network error'))

      const form = new FormData()
      form.append('file', file)
      form.append('filename', file.name)
      form.append('mimeType', file.type || 'video/mp4')
      xhr.send(form)
    })
  },

  generateCopy: ({ recordId, clientId, model, customInstructions }) =>
    authFetch('/generate-copy', {
      method: 'POST',
      body: JSON.stringify({ recordId, clientId, model, customInstructions })
    }),

  generateImages: ({ recordId, clientId, generationId, quality, includeLogo, customInstructions }) =>
    authFetch('/generate-images', {
      method: 'POST',
      body: JSON.stringify({ recordId, clientId, generationId, quality, includeLogo, customInstructions })
    }),

  scrapeWebsite: (url) =>
    authFetch('/scrape-website', {
      method: 'POST',
      body: JSON.stringify({ url })
    }),

  uploadClientAsset: (file, assetType, clientId) => {
    return new Promise((resolve, reject) => {
      const pwd = getPassword()
      if (!pwd) return reject(new Error('Not signed in'))

      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${API_BASE}/clients/upload-asset`)
      xhr.setRequestHeader('Authorization', `Bearer ${pwd}`)

      xhr.onload = () => {
        let data
        try { data = JSON.parse(xhr.responseText) } catch { data = { error: xhr.responseText } }
        if (xhr.status === 401) {
          clearPassword()
          reject(new Error('Invalid password'))
        } else if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data)
        } else {
          reject(new Error(data?.error || `${xhr.status}`))
        }
      }
      xhr.onerror = () => reject(new Error('Network error'))

      const form = new FormData()
      form.append('file', file)
      form.append('assetType', assetType)
      form.append('clientId', clientId || 'pending')
      xhr.send(form)
    })
  },

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
