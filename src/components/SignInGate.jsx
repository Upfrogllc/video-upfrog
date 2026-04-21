import { useState } from 'react'
import { api, setPassword } from '../api.js'

export default function SignInGate({ onSignIn }) {
  const [pwd, setPwd] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  const submit = async () => {
    if (!pwd.trim()) return
    setChecking(true); setError('')
    try {
      const ok = await api.verifyPassword(pwd)
      if (!ok) {
        setError('Wrong password')
        setChecking(false)
        return
      }
      setPassword(pwd)
      onSignIn()
    } catch (err) {
      setError(err.message || 'Something went wrong')
      setChecking(false)
    }
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-logo">
          <svg viewBox="0 0 40 40" width="40" height="40">
            <rect width="40" height="40" fill="currentColor" opacity="0.1" />
            <path d="M12 10 L30 20 L12 30 Z" fill="currentColor" />
          </svg>
        </div>
        <h1 className="gate-title">GEM / Video Analyzer</h1>
        <p className="gate-sub">Upfrog internal tool. Team members only.</p>

        <input
          type="password"
          className="url-input"
          placeholder="Team password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          disabled={checking}
          autoFocus
          style={{ marginBottom: 16 }}
        />

        {error && <div className="inline-error" style={{ marginBottom: 16 }}>{error}</div>}

        <button
          className="run-btn"
          onClick={submit}
          disabled={checking || !pwd.trim()}
        >
          {checking ? <><span className="spinner" /> Checking…</> : <>Sign in <span className="arrow">→</span></>}
        </button>

        <p className="gate-fine">Ask Justin for the team password.</p>
      </div>
    </div>
  )
}
