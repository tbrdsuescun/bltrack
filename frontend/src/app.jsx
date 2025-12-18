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
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i) || ''
        if (k && k.startsWith('tbMastersCache')) localStorage.removeItem(k)
      }
    } catch {}
    setUser(null)
    try { setConnIssue(null) } catch {}
  }, [])

  const [connIssue, setConnIssue] = useState(null)
  const [syncMsg, setSyncMsg] = useState(null)
  const [syncProgress, setSyncProgress] = useState(0)

  // Make logout available globally for components
  useEffect(() => {
    window.AppLogout = handleLogout
  }, [handleLogout])

  useEffect(() => {
    const token = localStorage.getItem('token')
    const userStr = localStorage.getItem('user')
    if (!token || !userStr) return
    let stale = true
    let puertoParam = ''
    let key = 'tbMastersCache'
    try {
      const u = JSON.parse(userStr || '{}')
      const pr = String(u?.puerto || '').trim()
      const uid = String(u?.id || '').trim()
      puertoParam = pr
      if (uid) key = `tbMastersCache:${uid}`
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
      if (window.__mastersFetching) return
      window.__mastersFetching = true
      window.MastersSync = { status: 'syncing', progress: 5, total: 0, count: 0 }
      setSyncMsg('Sincronizando masters')
      setSyncProgress(5)
      
      // Helper to save to storage or memory fallback
      const saveCache = (payload) => {
        try {
          localStorage.setItem(key, JSON.stringify(payload))
        } catch (e) {
          console.warn('LocalStorage full, using memory fallback')
          window['__MEM_' + key] = payload
        }
      }

      API.get('/masters').then(res => {
        const items = Array.isArray(res.data?.items) ? res.data.items : []
        const seed = items.map(it => ({ numeroMaster: String(it.master || ''), hijos: [] }))
        const payloadSeed = { data: seed, ts: Date.now() }
        saveCache(payloadSeed)
      }).catch(() => {}).finally(() => {
        API.get('/external/masters', config).then(res => {
          let data = Array.isArray(res.data?.data) ? res.data.data : []
          if (res.status === 304) {
            try {
              const v = JSON.parse(localStorage.getItem(key) || 'null') || window['__MEM_' + key]
              data = Array.isArray(v?.data) ? v.data : []
            } catch {}
          }
          if (data.length > 0) {
            const total = data.length
            // Optimize: map to essential fields to save space
            const minData = data.map(m => ({
              numeroMaster: m.numeroMaster,
              numeroDo: m.numeroDo,
              hijos: (m.hijos || []).map(h => ({
                numeroHBL: h.numeroHBL,
                cliente: h.cliente,
                puertoOrigen: h.puertoOrigen,
                numeroIE: h.numeroIE,
                numeroDo: h.numeroDo,
                paisOrigen: h.paisOrigen
              }))
            }))
            
            let idx = Math.max(1, Math.floor(total * 0.2))
            const first = { data: minData.slice(0, idx), ts: Date.now() }
            saveCache(first)
            
            setSyncProgress(Math.round((idx / total) * 100))
            const step = () => {
              if (idx >= total) {
                setSyncMsg(null)
                setConnIssue(null)
                window.MastersSync = { status: 'done', progress: 100, total, count: total }
                window.__mastersFetching = false
                return
              }
              idx = Math.min(total, idx + Math.max(1, Math.floor(total * 0.2)))
              const pl = { data: minData.slice(0, idx), ts: Date.now() }
              saveCache(pl)
              const pct = Math.round((idx / total) * 100)
              setSyncProgress(pct)
              window.MastersSync = { status: 'syncing', progress: pct, total, count: idx }
              setTimeout(step, 150)
            }
            window.MastersSync = { status: 'syncing', progress: Math.round((idx / total) * 100), total, count: idx }
            setTimeout(step, 200)
          } else {
            setSyncMsg(null)
            setConnIssue(null)
            window.MastersSync = { status: 'done', progress: 100, total: 0, count: 0 }
            window.__mastersFetching = false
          }
        }).catch(() => {
          setSyncMsg(null)
          try {
            const v = JSON.parse(localStorage.getItem(key) || 'null') || window['__MEM_' + key]
            const data = Array.isArray(v?.data) ? v.data : []
            if (data.length > 0) {
              setConnIssue(null)
              window.MastersSync = { status: 'done', progress: 100, total: data.length, count: data.length }
              window.__mastersFetching = false
              return
            }
          } catch {}
          setConnIssue('Sin conexión con el servidor. Trabajando con caché local')
          window.__mastersFetching = false
        })
      })
    }
    doFetch()
    return () => {}
  }, [user])

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
      {syncMsg && (
        <div style={{ position:'fixed', top: connIssue ? 36 : 0, left:0, right:0, background:'#eef6ff', color:'#034ea2', borderBottom:'1px solid #e5e7eb', padding:'8px 12px', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'#1c64f2' }} />
            <span>{syncMsg} {syncProgress ? (syncProgress + '%') : ''}</span>
          </div>
          <button type="button" onClick={() => setSyncMsg(null)} className="btn btn-small" style={{ background:'transparent', color:'#034ea2' }}>×</button>
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
