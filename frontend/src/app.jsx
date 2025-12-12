import React, { useState, useEffect, useCallback } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import API from './lib/api.js'
import Login from './pages/Login.jsx'
import Panel from './pages/Panel.jsx'
import BLList from './pages/BLList.jsx'
import BLDetail from './pages/BLDetail.jsx'
import BLEvidence from './pages/BLEvidence.jsx'
import AdminUsers from './pages/AdminUsers.jsx'
import Layout from './components/Layout.jsx'

 

// Protected Route component
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token')
  const user = localStorage.getItem('user')
  
  if (!token || !user) {
    return <Navigate to="/" replace />
  }
  
  return children
}

// Main App component
function App() {
  const [user, setUser] = useState(() => {
    try { 
      return JSON.parse(localStorage.getItem('user') || 'null')
    } catch { 
      return null 
    }
  })

  const handleLogout = useCallback(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
    try { setConnIssue(null) } catch {}
  }, [])

  const [connIssue, setConnIssue] = useState(null)

  // Make logout available globally for components
  useEffect(() => {
    window.AppLogout = handleLogout
  }, [handleLogout])

  useEffect(() => {
    const token = localStorage.getItem('token')
    const userStr = localStorage.getItem('user')
    if (!token || !userStr) return
    const key = 'tbMastersCache'
    let stale = true
    let puertoParam = ''
    try {
      const u = JSON.parse(userStr || '{}')
      const pr = String(u?.puerto || '').trim()
      puertoParam = pr
    } catch {}
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null')
      const ts = Number(v?.ts || 0)
      const ttl = 24 * 60 * 60 * 1000
      stale = !v || !Array.isArray(v.data) || (Date.now() - ts) > ttl
    } catch { stale = true }
    if (!stale) { setConnIssue(null); return }
    const config = puertoParam ? { params: { puerto: puertoParam } } : {}
    const doFetch = () => {
      API.get('/external/masters', config).then(res => {
        let data = Array.isArray(res.data?.data) ? res.data.data : []
        if (res.status === 304) {
          try {
            const v = JSON.parse(localStorage.getItem(key) || 'null')
            data = Array.isArray(v?.data) ? v.data : []
          } catch {}
        }
        if (data.length > 0) {
          const payload = { data, ts: Date.now() }
          try { localStorage.setItem(key, JSON.stringify(payload)) } catch {}
          setConnIssue(null)
        } else {
          setConnIssue(null)
        }
      }).catch(err => {
        try {
          const v = JSON.parse(localStorage.getItem(key) || 'null')
          const data = Array.isArray(v?.data) ? v.data : []
          if (data.length > 0) {
            setConnIssue(null)
            return
          }
        } catch {}
        setConnIssue('Sin conexión con el servidor. Se cerrará la sesión para reintentar conexión')
        try { window.AppLogout?.() } catch {}
      })
    }
    doFetch()
    return () => {}
  }, [])

  return (
    <>
      {connIssue && (
        <div style={{ position:'fixed', top:0, left:0, right:0, background:'#fff4e5', color:'#8a5c00', borderBottom:'1px solid #e5e7eb', padding:'8px 12px', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'#f1c40f' }} />
            <span>{connIssue}</span>
          </div>
          <button type="button" onClick={() => setConnIssue(null)} className="btn btn-small" style={{ background:'transparent', color:'#8a5c00' }}>×</button>
        </div>
      )}
      <Router future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <Routes>
        <Route path="/" element={<Login setUser={setUser} />} />
        <Route 
          path="/panel" 
          element={
            <ProtectedRoute>
              <Layout user={user} onLogout={handleLogout}>
                <Panel />
              </Layout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/bl" 
          element={
            <ProtectedRoute>
              <Layout user={user} onLogout={handleLogout}>
                <BLList />
              </Layout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/bl/:id" 
          element={
            <ProtectedRoute>
              <Layout user={user} onLogout={handleLogout}>
                <BLDetail />
              </Layout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/bl/new" 
          element={
            <ProtectedRoute>
              <Layout user={user} onLogout={handleLogout}>
                <BLDetail />
              </Layout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/evidence/:masterId/:hblId" 
          element={
            <ProtectedRoute>
              <Layout user={user} onLogout={handleLogout}>
                <BLEvidence />
              </Layout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/evidence/:id" 
          element={
            <ProtectedRoute>
              <Layout user={user} onLogout={handleLogout}>
                <BLEvidence />
              </Layout>
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin/users" 
          element={
            <ProtectedRoute>
              <Layout user={user} onLogout={handleLogout}>
                <AdminUsers />
              </Layout>
            </ProtectedRoute>
          } 
        />
      </Routes>
    </Router>
    </>
  )
}

export default App
