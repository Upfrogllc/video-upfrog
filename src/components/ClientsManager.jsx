import { useEffect, useState } from 'react'
import { api } from '../api.js'

const EMPTY_FORM = {
  business_name: '',
  location: '',
  vertical: '',
  tone_voice: '',
  notes: '',
  website_url: '',
  brand_summary: '',
  brand_fonts: '',
  primary_color: '',
  secondary_color: '',
  accent_color: '',
  logo_url: '',
  logo_storage_path: '',
  reference_photos: []
}

export default function ClientsManager({ onClose, onClientsChanged, initialClients = [] }) {
  const [clients, setClients] = useState(initialClients)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('list')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [scraping, setScraping] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const data = await api.listClients()
      setClients(data.clients || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && mode === 'list') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, onClose])

  useEffect(() => { load() }, [])

  const startNew = () => {
    setEditing(null); setForm(EMPTY_FORM); setError(''); setMode('edit')
  }

  const startEdit = (client) => {
    setEditing(client)
    setForm({
      business_name: client.business_name || '',
      location: client.location || '',
      vertical: client.vertical || '',
      tone_voice: client.tone_voice || '',
      notes: client.notes || '',
      website_url: client.website_url || '',
      brand_summary: client.brand_summary || '',
      brand_fonts: client.brand_fonts || '',
      primary_color: client.primary_color || '',
      secondary_color: client.secondary_color || '',
      accent_color: client.accent_color || '',
      logo_url: client.logo_url || '',
      logo_storage_path: client.logo_storage_path || '',
      reference_photos: Array.isArray(client.reference_photos) ? client.reference_photos : []
    })
    setError(''); setMode('edit')
  }

  const scrapeWebsite = async () => {
    if (!form.website_url.trim()) { setError('Enter a website URL first'); return }
    setScraping(true); setError('')
    try {
      const result = await api.scrapeWebsite(form.website_url.trim())
      setForm({
        ...form,
        brand_summary: result.summary || form.brand_summary,
        website_url: result.url || form.website_url
      })
    } catch (err) {
      setError(`Scrape failed: ${err.message}`)
    } finally {
      setScraping(false)
    }
  }

  const uploadLogo = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingLogo(true); setError('')
    try {
      const result = await api.uploadClientAsset(file, 'logo', editing?.id)
      setForm({ ...form, logo_url: result.asset.url, logo_storage_path: result.asset.storage_path })
    } catch (err) {
      setError(`Logo upload failed: ${err.message}`)
    } finally {
      setUploadingLogo(false)
      e.target.value = ''
    }
  }

  const uploadReferencePhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true); setError('')
    try {
      const result = await api.uploadClientAsset(file, 'reference', editing?.id)
      const newPhoto = {
        id: result.asset.id,
        url: result.asset.url,
        storage_path: result.asset.storage_path,
        caption: ''
      }
      setForm({ ...form, reference_photos: [...form.reference_photos, newPhoto] })
    } catch (err) {
      setError(`Photo upload failed: ${err.message}`)
    } finally {
      setUploadingPhoto(false)
      e.target.value = ''
    }
  }

  const removePhoto = (photoId) => {
    setForm({ ...form, reference_photos: form.reference_photos.filter((p) => p.id !== photoId) })
  }

  const save = async () => {
    if (!form.business_name.trim()) { setError('Business name is required'); return }
    setSaving(true); setError('')
    try {
      if (editing) {
        await api.updateClient(editing.id, form)
      } else {
        await api.createClient(form)
      }
      await load()
      onClientsChanged?.()
      setMode('list'); setEditing(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const archive = async (client) => {
    if (!confirm(`Archive ${client.business_name}? Existing copy and images for this client are preserved.`)) return
    try {
      await api.archiveClient(client.id)
      await load()
      onClientsChanged?.()
    } catch (err) {
      alert('Archive failed: ' + err.message)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => mode === 'list' && onClose()}>
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            <span className="mtab-heading">Clients</span>
          </div>
          <button className="modal-close" onClick={() => {
            if (mode === 'edit') { setMode('list'); setEditing(null) }
            else onClose()
          }}>×</button>
        </div>

        <div className="modal-body">
          {mode === 'list' && (
            <>
              <div className="clients-head-row">
                <div className="panel-label">{loading ? 'loading…' : `${clients.length} active`}</div>
                <button className="run-btn sm" onClick={startNew}>+ Add client</button>
              </div>

              {error && <div className="inline-error">{error}</div>}

              {!loading && clients.length === 0 && (
                <div className="empty-state sm">
                  <div className="empty-title">No clients yet</div>
                  <div className="empty-sub">Add your first white-label brand to generate copy and images.</div>
                </div>
              )}

              <ul className="client-list">
                {clients.map((c) => (
                  <li key={c.id} className="client-row">
                    <div className="client-avatar">
                      {c.logo_url ? (
                        <img src={c.logo_url} alt="" />
                      ) : (
                        <span className="avatar-initial">{c.business_name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="client-main">
                      <div className="client-name">{c.business_name}</div>
                      <div className="client-meta">
                        {[c.vertical, c.location].filter(Boolean).join(' · ') || '—'}
                      </div>
                      <div className="client-completeness">
                        {c.website_url && <span className="chip-mini">site</span>}
                        {c.brand_summary && <span className="chip-mini">summary</span>}
                        {c.logo_url && <span className="chip-mini">logo</span>}
                        {c.primary_color && <span className="chip-mini">colors</span>}
                        {Array.isArray(c.reference_photos) && c.reference_photos.length > 0 && (
                          <span className="chip-mini">{c.reference_photos.length} photos</span>
                        )}
                      </div>
                    </div>
                    <div className="client-actions">
                      <button className="link-btn" onClick={() => startEdit(c)}>edit</button>
                      <button className="link-btn danger" onClick={() => archive(c)}>archive</button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {mode === 'edit' && (
            <div className="client-form">
              {/* Section: Basics */}
              <div className="form-section">
                <div className="form-section-head">Basics</div>

                <div className="form-field">
                  <label>Business name *</label>
                  <input
                    className="url-input"
                    value={form.business_name}
                    onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                    placeholder="Semper Fi Heating & Cooling"
                  />
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <label>Location / service area</label>
                    <input
                      className="url-input"
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      placeholder="Mesa, AZ"
                    />
                  </div>
                  <div className="form-field">
                    <label>Vertical</label>
                    <input
                      className="url-input"
                      value={form.vertical}
                      onChange={(e) => setForm({ ...form, vertical: e.target.value })}
                      placeholder="HVAC"
                    />
                  </div>
                </div>
              </div>

              {/* Section: Brand voice */}
              <div className="form-section">
                <div className="form-section-head">Brand voice</div>

                <div className="form-field">
                  <label>Tone / voice</label>
                  <textarea
                    className="prompt-input"
                    rows={3}
                    value={form.tone_voice}
                    onChange={(e) => setForm({ ...form, tone_voice: e.target.value })}
                    placeholder="Faith-based, family-owned, military veteran-led. Warm and direct. Avoid corporate jargon."
                  />
                </div>

                <div className="form-field">
                  <label>Notes / offers / compliance</label>
                  <textarea
                    className="prompt-input"
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Current promo: $79 tune-up. Military discount always on. Never mention pricing in ads for residential."
                  />
                </div>
              </div>

              {/* Section: Website */}
              <div className="form-section">
                <div className="form-section-head">Website context</div>

                <div className="form-field">
                  <label>Website URL</label>
                  <div className="input-with-action">
                    <input
                      className="url-input"
                      value={form.website_url}
                      onChange={(e) => setForm({ ...form, website_url: e.target.value })}
                      placeholder="https://semperfihvac.com"
                    />
                    <button
                      className="secondary-btn sm"
                      onClick={scrapeWebsite}
                      disabled={scraping || !form.website_url.trim()}
                    >
                      {scraping ? <><span className="spinner" /> Scraping…</> : 'Fetch summary'}
                    </button>
                  </div>
                </div>

                <div className="form-field">
                  <label>Brand summary (auto-generated, editable)</label>
                  <textarea
                    className="prompt-input"
                    rows={4}
                    value={form.brand_summary}
                    onChange={(e) => setForm({ ...form, brand_summary: e.target.value })}
                    placeholder="Click 'Fetch summary' above to auto-generate from the website, or write your own."
                  />
                </div>
              </div>

              {/* Section: Visual identity */}
              <div className="form-section">
                <div className="form-section-head">Visual identity</div>

                <div className="form-field">
                  <label>Logo</label>
                  <div className="logo-uploader">
                    {form.logo_url ? (
                      <div className="logo-preview">
                        <img src={form.logo_url} alt="Logo" />
                        <button
                          className="link-btn danger"
                          onClick={() => setForm({ ...form, logo_url: '', logo_storage_path: '' })}
                        >remove</button>
                      </div>
                    ) : (
                      <label className="upload-btn">
                        {uploadingLogo ? <><span className="spinner" /> Uploading…</> : 'Upload logo (PNG/SVG)'}
                        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={uploadLogo} hidden disabled={uploadingLogo} />
                      </label>
                    )}
                  </div>
                </div>

                <div className="form-row three-col">
                  <div className="form-field">
                    <label>Primary color</label>
                    <ColorInput
                      value={form.primary_color}
                      onChange={(v) => setForm({ ...form, primary_color: v })}
                    />
                  </div>
                  <div className="form-field">
                    <label>Secondary color</label>
                    <ColorInput
                      value={form.secondary_color}
                      onChange={(v) => setForm({ ...form, secondary_color: v })}
                    />
                  </div>
                  <div className="form-field">
                    <label>Accent color</label>
                    <ColorInput
                      value={form.accent_color}
                      onChange={(v) => setForm({ ...form, accent_color: v })}
                    />
                  </div>
                </div>

                <div className="form-field">
                  <label>Brand fonts</label>
                  <input
                    className="url-input"
                    value={form.brand_fonts}
                    onChange={(e) => setForm({ ...form, brand_fonts: e.target.value })}
                    placeholder="Headline: Bebas Neue · Body: Inter"
                  />
                </div>

                <div className="form-field">
                  <label>Reference photos (products, lifestyle, hero shots)</label>
                  <div className="photos-grid">
                    {form.reference_photos.map((photo) => (
                      <div key={photo.id} className="photo-tile">
                        <img src={photo.url} alt="" />
                        <button
                          className="photo-remove"
                          onClick={() => removePhoto(photo.id)}
                          title="Remove"
                        >×</button>
                      </div>
                    ))}
                    <label className="photo-upload-tile">
                      {uploadingPhoto ? <><span className="spinner" /> Uploading…</> : (
                        <>
                          <div style={{ fontSize: 24, marginBottom: 4 }}>+</div>
                          <div>Add photo</div>
                        </>
                      )}
                      <input type="file" accept="image/*" onChange={uploadReferencePhoto} hidden disabled={uploadingPhoto} />
                    </label>
                  </div>
                </div>
              </div>

              {error && <div className="inline-error">{error}</div>}

              <div className="form-actions">
                <button
                  className="secondary-btn"
                  onClick={() => { setMode('list'); setEditing(null) }}
                  disabled={saving}
                >Cancel</button>
                <button className="run-btn" onClick={save} disabled={saving}>
                  {saving ? <><span className="spinner" /> Saving…</> : (editing ? 'Save changes' : 'Create client')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ColorInput({ value, onChange }) {
  const isValid = /^#[0-9A-Fa-f]{6}$/.test(value) || value === ''
  return (
    <div className="color-input">
      <input
        type="color"
        value={isValid && value ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="color-swatch"
      />
      <input
        type="text"
        className="url-input color-hex"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#FF5733"
      />
    </div>
  )
}
