import { useRef, useState } from 'react'
import { api } from '../api.js'

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB — Cloudflare Workers paid limit

export default function UploadPanel({ onAnalysisComplete }) {
  const [mode, setMode] = useState('youtube')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const fileInputRef = useRef(null)
  const tickRef = useRef(null)

  const isRunning = status !== 'idle'

  const startTick = () => {
    const t0 = Date.now()
    setElapsed(0)
    tickRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 250)
  }
  const stopTick = () => clearInterval(tickRef.current)

  const handleFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > MAX_FILE_SIZE) {
      setError(`File is ${(f.size / 1024 / 1024).toFixed(1)}MB. Max 100MB.`)
      return
    }
    setFile(f)
    setError('')
  }

  const run = async () => {
    setError('')
    if (mode === 'youtube' && !youtubeUrl.trim()) { setError('Paste a YouTube URL'); return }
    if (mode === 'upload' && !file) { setError('Pick a video file'); return }

    try {
      startTick()
      let result

      if (mode === 'youtube') {
        setStatus('processing')
        result = await api.analyzeVideoYouTube(youtubeUrl.trim())
        setYoutubeUrl('')
      } else {
        setStatus('uploading')
        setUploadProgress(0)
        result = await api.analyzeVideoUpload(file, (pct) => {
          setUploadProgress(pct)
          if (pct >= 100) setStatus('processing')
        })
        setFile(null)
      }

      stopTick()
      setStatus('idle')
      onAnalysisComplete(result.record)
    } catch (err) {
      stopTick()
      setStatus('idle')
      setError(err.message || 'Something broke')
    }
  }

  const statusLabel = () => {
    switch (status) {
      case 'uploading': return `uploading ${uploadProgress}%`
      case 'processing': return 'analyzing with gemini'
      default: return status
    }
  }

  return (
    <section className="upload-panel">
      <div className="panel-head">
        <span className="panel-label">New analysis</span>
        {isRunning && (
          <span className="elapsed">
            <span className="pulse-dot" /> {statusLabel()} · {elapsed}s
          </span>
        )}
      </div>

      <div className="mode-tabs">
        <button className={`tab ${mode === 'youtube' ? 'active' : ''}`} onClick={() => setMode('youtube')} disabled={isRunning}>YouTube URL</button>
        <button className={`tab ${mode === 'upload' ? 'active' : ''}`} onClick={() => setMode('upload')} disabled={isRunning}>File upload</button>
      </div>

      {mode === 'youtube' ? (
        <input
          type="url"
          className="url-input"
          placeholder="https://www.youtube.com/watch?v=..."
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          disabled={isRunning}
        />
      ) : (
        <div
          className={`drop-zone ${file ? 'has-file' : ''}`}
          onClick={() => !isRunning && fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (isRunning) return
            const f = e.dataTransfer.files?.[0]
            if (f) handleFileChange({ target: { files: [f] } })
          }}
        >
          {file ? (
            <>
              <div className="file-name">{file.name}</div>
              <div className="file-meta">{(file.size / 1024 / 1024).toFixed(2)} MB · {file.type || 'video'}</div>
              <button className="link-btn" onClick={(e) => { e.stopPropagation(); setFile(null) }} disabled={isRunning}>remove</button>
            </>
          ) : (
            <>
              <div className="drop-title">Drop video here</div>
              <div className="drop-sub">or click to browse · MP4, MOV, WebM up to 100MB</div>
            </>
          )}
          <input ref={fileInputRef} type="file" accept="video/*" hidden onChange={handleFileChange} />
        </div>
      )}

      {status === 'uploading' && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
        </div>
      )}

      {error && <div className="inline-error">{error}</div>}

      <button className="run-btn" onClick={run} disabled={isRunning}>
        {isRunning ? <><span className="spinner" /> {statusLabel()}…</> : <>Run GEM analysis <span className="arrow">→</span></>}
      </button>
    </section>
  )
}
