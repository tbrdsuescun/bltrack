import React from 'react'
import { useNavigate } from 'react-router-dom'

function Sidebar({ user, onLogout, onNavigate }) {
  const navigate = useNavigate()
  const isAdmin = user && user.role === 'admin'
  
  const NavItem = (label, path, icon) => (
    <button className="side-link" onClick={() => { navigate(path); onNavigate && onNavigate() }}>
      <span className="side-icon">{icon || '•'}</span>
      <span>{label}</span>
    </button>
  )

  const IconDashboard = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
    </svg>
  )

  const IconUsers = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" />
      <circle cx="16" cy="9" r="2.5" />
      <path d="M4 18a5 5 0 015-5h2a5 5 0 015 5" />
      <path d="M13 18c0-2.2 1.8-4 4-4h1" />
    </svg>
  )

  const IconPhotos = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <circle cx="8" cy="10" r="2" />
      <path d="M21 16l-6-6-4 4-3-3-5 5" />
    </svg>
  )

  return (
    <aside className="sidebar">
      <div className="side-header">
        <div className="side-logo">PhotoRegistry</div>
        <div className="side-subtitle">Web Application</div>
      </div>
      <nav className="side-nav">
        {NavItem('Dashboard', '/panel', <IconDashboard />)}
        {NavItem('BLs', '/bl', <IconPhotos />)}
        {isAdmin && NavItem('Users', '/admin/users', <IconUsers />)}
        {/* Extras del mockup */}
        {/* NavItem('Photos', '/bls', '🖼️'), */}
        {/* NavItem('Settings', '/panel', '⚙️'), */}
      </nav>
      <div className="side-footer">
        {user ? <div className="side-user">{user.nombre}</div> : <div className="side-user muted">Invitado</div>}
        <button className="side-logout" onClick={() => { onLogout(); onNavigate && onNavigate() }}>Logout</button>
      </div>
    </aside>
  )
}

export default React.memo(Sidebar)