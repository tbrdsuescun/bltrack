import React, { useState, useEffect } from 'react'
import Sidebar from './Sidebar'

function Layout({ user, onLogout, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Cerrar sidebar si cambia el tamaño a desktop
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 768 && sidebarOpen) setSidebarOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [sidebarOpen])

  // Cerrar al navegar
  const handleNavigate = () => setSidebarOpen(false)

  return (
    <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <div className="mobile-header">
        <button className="menu-btn" onClick={() => setSidebarOpen(v => !v)}>☰</button>
        <div className="mobile-title">BL Track</div>
        <div style={{width:24}} />
      </div>
      <Sidebar user={user} onLogout={onLogout} onNavigate={handleNavigate} />
      <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      <main className="content">
        {children}
      </main>
    </div>
  )
}

export default Layout