export default function Header({ user, clientCount, onManageClients, onSignOut }) {
  return (
    <header className="header">
      <div className="logo">
        <svg viewBox="0 0 40 40" width="28" height="28">
          <rect width="40" height="40" fill="currentColor" opacity="0.1" />
          <path d="M12 10 L30 20 L12 30 Z" fill="currentColor" />
        </svg>
        <div>
          <div className="logo-title">GEM / VIDEO ANALYZER</div>
          <div className="logo-sub">upfrog internal · gemini + openai</div>
        </div>
      </div>

      <div className="header-right">
        <button className="clients-btn" onClick={onManageClients} title="Manage white-label clients">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
            <path d="M5 4a3 3 0 116 0 3 3 0 01-6 0zM2 14a6 6 0 1112 0H2z"/>
          </svg>
          Clients <span className="count-badge">{clientCount}</span>
        </button>
        <div className="user-chip">
          <div className="user-dot" />
          <span className="user-email">{user?.email || 'signed in'}</span>
          <button className="sign-out" onClick={onSignOut}>sign out</button>
        </div>
      </div>
    </header>
  )
}
