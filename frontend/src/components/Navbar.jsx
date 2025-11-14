import React from 'react'
import { useNavigate } from 'react-router-dom'

function Navbar({ user, onLogout }) {
  const navigate = useNavigate()
  const isAdmin = user && user.role === 'admin'
  
  function NavLink(label, path) {
    return <button className="btn btn-link" onClick={() => navigate(path)}>{label}</button>
  }
  
  return (
    <div className="navbar">
      <div className="container" style={{ display: 'flex', alignItems: 'center' }}>
        <span className="brand">BL Track</span>
        <div style={{ marginLeft: '20px' }}>
          {NavLink('Panel', '/panel')}
          {NavLink('BLs', '/bl')}
          {isAdmin && NavLink('Usuarios', '/admin/users')}
        </div>
        <div className="spacer" />
        {user ? <span className="user">{user.nombre}</span> : <span className="muted">Invitado</span>}
        <button className="btn btn-outline" onClick={onLogout}>Salir</button>
      </div>
    </div>
  )
}

export default React.memo(Navbar)