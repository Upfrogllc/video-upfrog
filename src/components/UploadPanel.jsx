import { useRef, useState } from 'react'
import { api } from '../api.js'

const MAX_FILE_SIZE = 500 * 1024 * 1024 // 500 MB soft cap in UI; Gemini accepts up to 2GB

export default function UploadPanel({ onAnalysisComplete }) {
  const [mode, setMode] = useState('youtube')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle')
  // status flow (upload mode): idle → requesting → uploading (with progress) → processing → idle
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
  const stopTick = () => { clearInterval(tickRef.current) }

  const handleFileChange = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > MAX_FILE_SIZE) {
      setError(`File is ${(f.size / 1024 / 1024).toFixed(1)}MB. Max 500MB.`)
      return
    }
    setFile(f)
    setError('')
  }

  const run = async () => {
    setError('')
    if (mode === 'youtube' && !youtubeUrl.trim()) {
      setError('Paste a YouTube URL'); return
    }
    if (mode === 'upload' && !file) {
      setError('Pick a video file'); return
    }

    try {
      startTick()

      if (mode === 'youtube') {
        setStatus('processing')
        const result = await api.analyzeVideo({
          mode: 'youtube',
          youtubeUrl: youtubeUrl.trim()
        })
        onAnalysisComplete(result.record)
        setYoutubeUrl('')
      } else {
        // 1. Ask our function for a Google upload URL
        setStatus('requesting')
        const { uploadUrl } = await api.createUpload({
          filename: file.name,
          mimeType: file.type || 'video/mp4',
          sizeBytes: file.size
        })

        // 2. Upload the file directly to Google (bypasses Netlify)
        setStatus('uploading')
        setUploadProgress(0)
        const fileUri = await uploadToGoogle(file, uploadUrl, setUploadProgress)

        // 3. Ask our function to analyze the uploaded file
        setStatus('processing')
        const result = await api.analyzeVideo({
          mode: 'upload',
          fileUri,
          mimeType: file.type || 'video/mp4',
          filename: file.name
        })
        onAnalysisComplete(result.record)
        setFile(null)
      }

      stopTick()
      setStatus('idle')
    } catch (err) {
      stopTick()
      setStatus('idle')
      setError(err.message || 'Something broke. Check the function logs.')
    }
  }

  const statusLabel = () => {
    switch (status) {
      case 'requesting': return 'preparing upload'
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
              <div className="drop-sub">or click to browse · MP4, MOV, WebM up to 500MB</div>
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

      {status === 'uploading' && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
        </div>
      )}

      {error && <div className="inline-error">{error}</div>}

      <button className="run-btn" onClick={run} disabled={isRunning}>
        {isRunning ? (
          <><span className="spinner" /> {statusLabel()}…</>
        ) : (
          <>Run GEM analysis <span className="arrow">→</span></>
        )}
      </button>
    </section>
  )
}

// Upload a file directly to Google's resumable upload URL with progress tracking.
// Returns the final fileUri on success.
function uploadToGoogle(file, uploadUrl, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', uploadUrl)
    xhr.setRequestHeader('Content-Length', String(file.size))
    xhr.setRequestHeader('X-Goog-Upload-Offset', '0')
    xhr.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize')

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText)
          const fileUri = body?.file?.uri
          if (!fileUri) {
            reject(new Error('Google upload succeeded but returned no fileUri'))
            return
          }
          resolve(fileUri)
        } catch (err) {
          reject(new Error(`Could not parse Google response: ${err.message}`))
        }
      } else {
        reject(new Error(`Google upload failed: ${xhr.status} ${xhr.responseText?.slice(0, 200)}`))
      }
    }

    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.onabort = () => reject(new Error('Upload aborted'))

    xhr.send(file)
  })
}
