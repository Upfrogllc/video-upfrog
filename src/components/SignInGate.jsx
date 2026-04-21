export default function SignInGate({ onSignIn }) {
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
        <button className="run-btn" onClick={onSignIn}>
          Sign in / Request access <span className="arrow">→</span>
        </button>
        <p className="gate-fine">
          New teammates: request access and Justin will approve you.
        </p>
      </div>
    </div>
  )
}
