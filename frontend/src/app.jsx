import React, { useState, useEffect, useCallback } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import axios from 'axios'
import Login from './pages/Login.jsx'
import Panel from './pages/Panel.jsx'
import BLList from './pages/BLList.jsx'
import BLDetail from './pages/BLDetail.jsx'
import AdminUsers from './pages/AdminUsers.jsx'
import Layout from './components/Layout.jsx'

// Configure axios
const API = axios.create({ 
  baseURL: import.meta.env.PROD ? '' : 'http://localhost:4001'
})

// Add auth token to requests
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

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

  return (
    <Router>
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