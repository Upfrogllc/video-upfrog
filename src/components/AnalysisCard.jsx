import { parseGemRow } from '../prompts.js'

export default function AnalysisCard({ record, onOpen, onDelete }) {
  const parsed = parseGemRow(record.gem_row)
  const get = (col) => parsed[col] || '—'

  const generations = Array.isArray(record.copy_generations) ? record.copy_generations : []
  const genCount = generations.length
  const uniqueClients = new Set(generations.map((g) => g.client_id).filter(Boolean)).size

  const andromeda = parseInt(get('Q'), 10)
  const scoreTier = !isNaN(andromeda)
    ? andromeda >= 75 ? 'high' : andromeda >= 50 ? 'mid' : 'low'
    : 'none'

  const createdDate = new Date(record.created_at).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  })

  return (
    <div className="card" onClick={onOpen}>
      <div className="card-head">
        <div className="card-source">
          <span className={`src-tag src-${record.source}`}>
            {record.source === 'youtube' ? 'YT' : 'FILE'}
          </span>
          <span className="card-label" title={record.source_label}>
            {record.source_label}
          </span>
        </div>
        <button
          className="card-del"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          title="Delete"
        >×</button>
      </div>

      <div className="card-grid">
        <div className="card-field">
          <div className="cf-label">Category</div>
          <div className="cf-value">{get('G')}</div>
        </div>
        <div className="card-field">
          <div className="cf-label">Archetype</div>
          <div className="cf-value">{get('T')}</div>
        </div>
        <div className="card-field">
          <div className="cf-label">Funnel</div>
          <div className="cf-value">{get('Z')}</div>
        </div>
        <div className="card-field">
          <div className="cf-label">Intent</div>
          <div className="cf-value">{get('N')}</div>
        </div>
      </div>

      <div className="card-tropes">
        <div className="cf-label">Tropes</div>
        <div className="trope-text">{get('I')}</div>
      </div>

      <div className="card-foot">
        <div className={`score score-${scoreTier}`}>
          <div className="score-label">Andromeda</div>
          <div className="score-val">{isNaN(andromeda) ? '—' : andromeda}</div>
        </div>
        <div className="card-actions">
          <div className="card-date">{createdDate}</div>
          {record.created_by_email && (
            <div className="card-author">{record.created_by_email.split('@')[0]}</div>
          )}
          {genCount > 0 ? (
            <span className="copy-chip">
              ✓ {genCount} cop{genCount === 1 ? 'y' : 'ies'}
              {uniqueClients > 1 && ` · ${uniqueClients} brands`}
            </span>
          ) : (
            <span className="no-copy-chip">no copy yet</span>
          )}
        </div>
      </div>
    </div>
  )
}
