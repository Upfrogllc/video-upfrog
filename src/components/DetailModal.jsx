import { useEffect, useState } from 'react'
import {
  GEM_COLUMNS,
  AD_COPY_SECTIONS,
  OPENAI_MODELS,
  DEFAULT_MODEL,
  parseGemRow,
  gemRowToTSV
} from '../prompts.js'
import { api } from '../api.js'

export default function DetailModal({ record, clients, onClose, onUpdate }) {
  const [tab, setTab] = useState('analysis') // 'analysis' | 'copy'
  const [selectedGenIdx, setSelectedGenIdx] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  // Generator form state
  const [selectedClientId, setSelectedClientId] = useState('')
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL)
  const [showGenerator, setShowGenerator] = useState(false)

  const generations = Array.isArray(record.copy_generations) ? record.copy_generations : []

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    // Default generator to first (most recent) client
    if (!selectedClientId && clients.length > 0) {
      setSelectedClientId(clients[0].id)
    }
  }, [clients, selectedClientId])

  const parsed = parseGemRow(record.gem_row)

  const handleCopyTSV = async () => {
    await navigator.clipboard.writeText(gemRowToTSV(record.gem_row))
  }

  const handleCopyRaw = async () => {
    await navigator.clipboard.writeText(record.gem_row)
  }

  const runGenerate = async () => {
    if (!selectedClientId) {
      setError('Pick a client first'); return
    }
    setGenerating(true); setError('')
    try {
      const result = await api.generateCopy({
        recordId: record.id,
        clientId: selectedClientId,
        model: selectedModel
      })
      onUpdate(result.record)
      setTab('copy')
      setSelectedGenIdx(0) // newest is at index 0
      setShowGenerator(false)
    } catch (err) {
      setError(err.message || 'Copy generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const currentGen = generations[selectedGenIdx]

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">
            <span className={`src-tag src-${record.source}`}>
              {record.source === 'youtube' ? 'YT' : 'FILE'}
            </span>
            <span className="modal-label" title={record.source_label}>{record.source_label}</span>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-tabs">
          <button
            className={`mtab ${tab === 'analysis' ? 'active' : ''}`}
            onClick={() => setTab('analysis')}
          >GEM Analysis</button>
          <button
            className={`mtab ${tab === 'copy' ? 'active' : ''}`}
            onClick={() => setTab('copy')}
          >
            Ad Copy
            {generations.length > 0 && (
              <span className="tab-count">{generations.length}</span>
            )}
          </button>
        </div>

        <div className="modal-body">
          {tab === 'analysis' && (
            <div>
              <div className="analysis-actions">
                <button className="secondary-btn sm" onClick={handleCopyTSV}>
                  Copy as TSV (→ Sheets A–Z)
                </button>
                <button className="secondary-btn sm" onClick={handleCopyRaw}>
                  Copy raw pipe row
                </button>
              </div>

              <table className="gem-table">
                <tbody>
                  {GEM_COLUMNS.map((col) => (
                    <tr key={col.key}>
                      <td className="col-key">{col.key}</td>
                      <td className="col-label">{col.label}</td>
                      <td className="col-value">{parsed[col.key] || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'copy' && (
            <div>
              {/* Generation picker + New button */}
              <div className="gen-toolbar">
                {generations.length > 0 && (
                  <div className="gen-switcher">
                    <label className="panel-label">View generation:</label>
                    <select
                      className="select"
                      value={selectedGenIdx}
                      onChange={(e) => setSelectedGenIdx(parseInt(e.target.value, 10))}
                    >
                      {generations.map((g, idx) => (
                        <option key={g.id} value={idx}>
                          {g.client_name} · {g.model} · {new Date(g.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  className="run-btn sm"
                  onClick={() => setShowGenerator(!showGenerator)}
                  disabled={generating}
                >
                  {showGenerator ? 'Cancel' : '+ Generate for client'}
                </button>
              </div>

              {/* Generator panel */}
              {(showGenerator || generations.length === 0) && (
                <div className="generator-panel">
                  <div className="gen-title">Generate new ad copy</div>

                  {clients.length === 0 ? (
                    <div className="inline-warn">
                      No active clients. Add a client in the Clients manager before generating copy.
                    </div>
                  ) : (
                    <>
                      <div className="form-row">
                        <div className="form-field">
                          <label>Client brand</label>
                          <select
                            className="select"
                            value={selectedClientId}
                            onChange={(e) => setSelectedClientId(e.target.value)}
                            disabled={generating}
                          >
                            {clients.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.business_name}
                                {c.location ? ` · ${c.location}` : ''}
                                {c.vertical ? ` · ${c.vertical}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="form-field">
                          <label>OpenAI model</label>
                          <select
                            className="select"
                            value={selectedModel}
                            onChange={(e) => setSelectedModel(e.target.value)}
                            disabled={generating}
                          >
                            {OPENAI_MODELS.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.label} — {m.desc}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {error && <div className="inline-error">{error}</div>}

                      <button
                        className="run-btn"
                        onClick={runGenerate}
                        disabled={generating || !selectedClientId}
                      >
                        {generating
                          ? <><span className="spinner" /> Generating…</>
                          : <>Generate copy <span className="arrow">→</span></>
                        }
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Display selected generation */}
              {currentGen && !showGenerator && (
                <div className="gen-display">
                  <div className="gen-header">
                    <div>
                      <div className="gen-brand">{currentGen.client_name}</div>
                      <div className="gen-meta">
                        {[currentGen.client_vertical, currentGen.client_location].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div className="gen-stamp">
                      <div className="gen-model">{currentGen.model}</div>
                      <div className="gen-date">
                        by {currentGen.created_by_email?.split('@')[0] || 'unknown'} ·
                        {' ' + new Date(currentGen.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>

                  <div className="copy-sections">
                    {AD_COPY_SECTIONS.map((sec) => (
                      <AdCopyBlock
                        key={sec.key}
                        label={sec.label}
                        desc={sec.desc}
                        body={currentGen[sec.key]}
                      />
                    ))}

                    {Array.isArray(currentGen.headlines) && currentGen.headlines.length > 0 && (
                      <div className="copy-block headlines">
                        <div className="copy-block-head">
                          <div>
                            <div className="cb-label">Headlines</div>
                            <div className="cb-desc">Max 8 words · Meta click-through</div>
                          </div>
                        </div>
                        <ol className="headline-list">
                          {currentGen.headlines.map((h, i) => (
                            <li key={i}>
                              <span>{h}</span>
                              <button
                                className="link-btn"
                                onClick={() => navigator.clipboard.writeText(h)}
                              >copy</button>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AdCopyBlock({ label, desc, body }) {
  if (!body) return null
  return (
    <div className="copy-block">
      <div className="copy-block-head">
        <div>
          <div className="cb-label">{label}</div>
          <div className="cb-desc">{desc}</div>
        </div>
        <button
          className="link-btn"
          onClick={() => navigator.clipboard.writeText(body)}
        >copy</button>
      </div>
      <div className="copy-block-body">{body}</div>
    </div>
  )
}
