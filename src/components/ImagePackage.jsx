import { useState } from 'react'
import { api } from '../api.js'

const QUALITY_OPTIONS = [
  { id: 'low', label: 'Low', desc: 'Fast · ~$0.01/image · draft quality' },
  { id: 'medium', label: 'Medium', desc: 'Balanced · ~$0.05/image · recommended' },
  { id: 'high', label: 'High', desc: 'Best quality · ~$0.20/image · hero creatives' },
  { id: 'auto', label: 'Auto', desc: 'OpenAI picks · variable cost' }
]

export default function ImagePackage({ record, generation, onUpdate }) {
  const [generating, setGenerating] = useState(false)
  const [quality, setQuality] = useState('medium')
  const [error, setError] = useState('')
  const [selectedPkgIdx, setSelectedPkgIdx] = useState(0)
  const [downloadingZip, setDownloadingZip] = useState(false)

  // Filter image packages that match this specific copy generation
  const allPackages = Array.isArray(record.image_packages) ? record.image_packages : []
  const packages = allPackages.filter((p) => p.generation_id === generation.id)
  const currentPkg = packages[selectedPkgIdx]

  const handleGenerate = async () => {
    setGenerating(true); setError('')
    try {
      const result = await api.generateImages({
        recordId: record.id,
        clientId: generation.client_id,
        generationId: generation.id,
        quality
      })
      onUpdate(result.record)
      setSelectedPkgIdx(0)
    } catch (err) {
      setError(err.message || 'Image generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const downloadImage = async (url, filename) => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objUrl)
    } catch (err) {
      alert('Download failed: ' + err.message)
    }
  }

  const downloadAll = async () => {
    if (!currentPkg) return
    setDownloadingZip(true)
    try {
      // Create zip client-side using native browser APIs
      const JSZip = await loadJSZip()
      const zip = new JSZip()
      const folderName = `${sanitize(currentPkg.client_name)}_ads`
      const folder = zip.folder(folderName)

      // Add a README describing the package
      folder.file('README.txt', buildReadmeText(currentPkg, generation))

      // Add each image
      for (const img of currentPkg.images) {
        const res = await fetch(img.public_url)
        const blob = await res.blob()
        const filename = imageFilename(currentPkg, img)
        folder.file(filename, blob)
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${folderName}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      alert('Zip download failed: ' + err.message)
    } finally {
      setDownloadingZip(false)
    }
  }

  return (
    <div className="image-package">
      <div className="image-package-head">
        <div>
          <div className="cb-label">Static ad images</div>
          <div className="cb-desc">
            3 variations × 2 sizes · Generated with GPT Image · Headlines picked by AI for CTR
          </div>
        </div>
        {packages.length > 0 && (
          <div className="gen-stamp">
            <span className="gen-model">{currentPkg?.model}</span>
          </div>
        )}
      </div>

      {/* Package switcher */}
      {packages.length > 1 && (
        <div className="gen-switcher" style={{ marginBottom: 12 }}>
          <label className="panel-label">View package:</label>
          <select
            className="select"
            value={selectedPkgIdx}
            onChange={(e) => setSelectedPkgIdx(parseInt(e.target.value, 10))}
          >
            {packages.map((p, idx) => (
              <option key={p.id} value={idx}>
                {new Date(p.created_at).toLocaleString(undefined, {
                  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                })} · {p.quality}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Show existing package grid */}
      {currentPkg && (
        <>
          <div className="chosen-headline-banner">
            <span className="panel-label">Chosen headline:</span>
            <span className="chosen-headline-text">"{currentPkg.chosen_headline}"</span>
          </div>

          <div className="image-grid">
            {currentPkg.images.map((img) => (
              <div key={img.id} className="image-tile">
                <div className="image-tile-label">
                  <span>{img.size === 'square' ? '1:1 Feed' : '2:3 Vertical'}</span>
                  <span className="image-tile-var">V{img.variation_num}</span>
                </div>
                <div className="image-tile-wrap" data-size={img.size}>
                  <img src={img.public_url} alt={`${img.size} variation ${img.variation_num}`} loading="lazy" />
                </div>
                <button
                  className="secondary-btn sm image-dl-btn"
                  onClick={() => downloadImage(img.public_url, imageFilename(currentPkg, img))}
                >
                  Download
                </button>
              </div>
            ))}
          </div>

          <div className="image-download-all">
            <button
              className="run-btn sm"
              onClick={downloadAll}
              disabled={downloadingZip}
            >
              {downloadingZip ? <><span className="spinner" /> Zipping…</> : 'Download all as zip'}
            </button>
          </div>
        </>
      )}

      {/* Generator */}
      <div className="image-generator">
        <div className="panel-label" style={{ marginBottom: 8 }}>
          {packages.length > 0 ? 'Generate new variations' : 'Generate images'}
        </div>
        <div className="form-row">
          <div className="form-field">
            <label>Quality</label>
            <select
              className="select"
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              disabled={generating}
            >
              {QUALITY_OPTIONS.map((q) => (
                <option key={q.id} value={q.id}>{q.label} — {q.desc}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <div className="inline-error">{error}</div>}

        <button
          className="run-btn"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <><span className="spinner" /> Generating 6 images (~60-90s)…</>
          ) : (
            <>Generate static ads <span className="arrow">→</span></>
          )}
        </button>
      </div>
    </div>
  )
}

function sanitize(s) {
  return (s || 'client').replace(/[^\w\-]+/g, '_').slice(0, 60)
}

function imageFilename(pkg, img) {
  const clientSlug = sanitize(pkg.client_name)
  const sizeSlug = img.size === 'square' ? '1080x1080' : '1024x1536'
  return `${clientSlug}_${img.size}_v${img.variation_num}_${sizeSlug}.png`
}

function buildReadmeText(pkg, generation) {
  return `Ad Package — ${pkg.client_name}
Generated: ${new Date(pkg.created_at).toLocaleString()}
Model: ${pkg.model}  Quality: ${pkg.quality}
Created by: ${pkg.created_by_email}

Headline used (AI-selected for CTR):
"${pkg.chosen_headline}"

Copy generation used: ${generation.model} · ${new Date(generation.created_at).toLocaleString()}

Image dimensions:
- 1024x1024 square — for Facebook/Instagram Feed, Carousels
- 1024x1536 vertical — designed for Stories/Reels (crop to 1080x1920 9:16 in Meta Ads Manager)

Usage:
Upload to Meta Ads Manager as static image creatives. Meta will auto-select the best
dimension per placement. For Stories/Reels, the vertical version may need a crop
down to 1080x1920 for perfect fit.
`
}

// Lazy-load JSZip from CDN so we don't bloat the main bundle
async function loadJSZip() {
  if (window.JSZip) return window.JSZip
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
    script.onload = () => resolve(window.JSZip)
    script.onerror = () => reject(new Error('Failed to load JSZip'))
    document.head.appendChild(script)
  })
}
