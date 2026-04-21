import { useEffect, useState } from 'react'
import { api } from '../api.js'

const EMPTY_FORM = {
  business_name: '',
  location: '',
  vertical: '',
  tone_voice: '',
  notes: ''
}

export default function ClientsManager({ onClose, onClientsChanged, initialClients = [] }) {
  const [clients, setClients] = useState(initialClients)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('list') // list | edit
  const [editing, setEditing] = useState(null) // null | {} (new) | existing client
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
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
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setMode('edit')
  }

  const startEdit = (client) => {
    setEditing(client)
    setForm({
      business_name: client.business_name || '',
      location: client.location || '',
      vertical: client.vertical || '',
      tone_voice: client.tone_voice || '',
      notes: client.notes || ''
    })
    setError('')
    setMode('edit')
  }

  const save = async () => {
    if (!form.business_name.trim()) {
      setError('Business name is required')
      return
    }
    setSaving(true); setError('')
    try {
      if (editing) {
        await api.updateClient(editing.id, form)
      } else {
        await api.createClient(form)
      }
      await load()
      onClientsChanged?.()
      setMode('list')
      setEditing(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const archive = async (client) => {
    if (!confirm(`Archive ${client.business_name}? Existing copy generated for this client is preserved.`)) return
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
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
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
                <button className="run-btn sm" onClick={startNew}>
                  + Add client
                </button>
              </div>

              {error && <div className="inline-error">{error}</div>}

              {!loading && clients.length === 0 && (
                <div className="empty-state sm">
                  <div className="empty-title">No clients yet</div>
                  <div className="empty-sub">Add your first white-label brand to generate copy.</div>
                </div>
              )}

              <ul className="client-list">
                {clients.map((c) => (
                  <li key={c.id} className="client-row">
                    <div className="client-main">
                      <div className="client-name">{c.business_name}</div>
                      <div className="client-meta">
                        {[c.vertical, c.location].filter(Boolean).join(' · ') || '—'}
                      </div>
                      {c.tone_voice && (
                        <div className="client-tone" title={c.tone_voice}>
                          {c.tone_voice.length > 90 ? c.tone_voice.slice(0, 90) + '…' : c.tone_voice}
                        </div>
                      )}
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
                <label>Notes (optional)</label>
                <textarea
                  className="prompt-input"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Current promo: $79 tune-up. Military discount always on."
                />
              </div>

              {error && <div className="inline-error">{error}</div>}

              <div className="form-actions">
                <button
                  className="secondary-btn"
                  onClick={() => { setMode('list'); setEditing(null) }}
                  disabled={saving}
                >Cancel</button>
                <button
                  className="run-btn"
                  onClick={save}
                  disabled={saving}
                >
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
