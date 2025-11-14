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

  return (
    <aside className="sidebar">
      <div className="side-header">
        <div className="side-logo">PhotoRegistry</div>
        <div className="side-subtitle">Web Application</div>
      </div>
      <nav className="side-nav">
        {NavItem('Dashboard', '/panel', '🏠')}
        {NavItem('BLs', '/bl', '📦')}
        {isAdmin && NavItem('Users', '/admin/users', '👥')}
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