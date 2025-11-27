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
  }, [])

  // Make logout available globally for components
  useEffect(() => {
    window.AppLogout = handleLogout
  }, [handleLogout])

  useEffect(() => {
    const key = 'tbMastersCache'
    let stale = true
    let puertoParam = ''
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}')
      const pr = String(u?.puerto || '').trim().toLowerCase()
      puertoParam = pr
    } catch {}
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null')
      const ts = Number(v?.ts || 0)
      const ttl = 24 * 60 * 60 * 1000
      stale = !v || !Array.isArray(v.data) || (Date.now() - ts) > ttl
    } catch { stale = true }
    if (stale) {
      const config = puertoParam ? { params: { puerto: puertoParam } } : {}
      API.get('/external/masters', config).then(res => {
        const data = Array.isArray(res.data?.data) ? res.data.data : []
        if (data.length > 0) {
          const payload = { data, ts: Date.now() }
          try { localStorage.setItem(key, JSON.stringify(payload)) } catch {}
        }
      }).catch(() => {
        try { alert('No se obtuvo información o no se pudo conectar con el servidor') } catch {}
      })
    }
  }, [])

  return (
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
  )
}

export default App
