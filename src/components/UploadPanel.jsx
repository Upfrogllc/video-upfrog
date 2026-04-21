import { useRef, useState } from 'react'
import { api } from '../api.js'

export default function UploadPanel({ onAnalysisComplete }) {
  const [mode, setMode] = useState('youtube')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const fileInputRef = useRef(null)

  const isRunning = status === 'uploading' || status === 'analyzing'

  const tickRef = useRef(null)
  const startTick = () => {
    const t0 = Date.now()
    setElapsed(0)
    tickRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 250)
  }
  const stopTick = () => { clearInterval(tickRef.current) }

  const handleFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    const MAX = 20 * 1024 * 1024
    if (f.size > MAX) {
      setError(`File is ${(f.size / 1024 / 1024).toFixed(1)}MB. Max 20MB via this upload path — use a YouTube URL for bigger videos.`)
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
      let payload
      if (mode === 'youtube') {
        setStatus('analyzing'); startTick()
        payload = { mode: 'youtube', youtubeUrl: youtubeUrl.trim() }
      } else {
        setStatus('uploading'); startTick()
        const base64 = await fileToBase64(file)
        setStatus('analyzing')
        payload = {
          mode: 'upload',
          fileData: base64,
          mimeType: file.type || 'video/mp4',
          filename: file.name
        }
      }

      const result = await api.analyzeVideo(payload)
      stopTick()
      setStatus('idle')

      // reset inputs
      setYoutubeUrl(''); setFile(null)
      onAnalysisComplete(result.record)
    } catch (err) {
      stopTick()
      setStatus('idle')
      setError(err.message || 'Something broke. Check the function logs.')
    }
  }

  return (
    <section className="upload-panel">
      <div className="panel-head">
        <span className="panel-label">New analysis</span>
        {isRunning && (
          <span className="elapsed">
            <span className="pulse-dot" /> {status} · {elapsed}s
          </span>
        )}
      </div>

      <div className="mode-tabs">
        <button
          className={`tab ${mode === 'youtube' ? 'active' : ''}`}
          onClick={() => setMode('youtube')}
          disabled={isRunning}
        >YouTube URL</button>
        <button
          className={`tab ${mode === 'upload' ? 'active' : ''}`}
          onClick={() => setMode('upload')}
          disabled={isRunning}
        >File upload</button>
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
              <button
                className="link-btn"
                onClick={(e) => { e.stopPropagation(); setFile(null) }}
                disabled={isRunning}
              >remove</button>
            </>
          ) : (
            <>
              <div className="drop-title">Drop video here</div>
              <div className="drop-sub">or click to browse · MP4, MOV, WebM up to 20MB</div>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            hidden
            onChange={handleFileChange}
          />
        </div>
      )}

      {error && <div className="inline-error">{error}</div>}

      <button className="run-btn" onClick={run} disabled={isRunning}>
        {isRunning ? (
          <><span className="spinner" /> Running GEM analysis…</>
        ) : (
          <>Run GEM analysis <span className="arrow">→</span></>
        )}
      </button>
    </section>
  )
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result.split(',')[1])
    r.onerror = reject
    r.readAsDataURL(file)
  })
}
