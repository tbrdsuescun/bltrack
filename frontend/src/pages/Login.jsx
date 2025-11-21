import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import API from '../lib/api.js'
import axios from 'axios'

function Login({ setUser }) {
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { isSubmitting } } = useForm()
  const imageUrl = '/src/assets/banner-login.png'
  const [error, setError] = useState(null)

  const onSubmit = async (data) => {
    try {
      const res = await API.post('/auth/login', data)
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      try {
        const puertoRaw = String(res.data.user?.puerto || '').trim()
        const puerto = puertoRaw ? encodeURIComponent(puertoRaw.toLowerCase()) : ''
        if (puerto) {
          const url = `http://tracking.transborder.com.co/Development/ApisNotes-Cotiz/DevRestApiNotesCotiz.nsf/api.xsp/operaciones/masters?puerto=${puerto}`
          const mastersRes = await axios.get(url, { auth: { username: 'cconsumer', password: 'cotizadorapiconsumer' } })
          try { localStorage.setItem('tbMastersCache', JSON.stringify(mastersRes.data)) } catch {}
        }
      } catch {}
      setUser(res.data.user)
      navigate('/panel')
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Error desconocido'
      setError('Login falló: ' + msg)
    }
  }

  const LoginHero = React.memo(function LoginHero({ imageUrl }) {
    return (
      <div className="login-image" style={{ backgroundImage: `url(${imageUrl})` }}>
        <div className="login-overlay">
          <div className="login-overlay-content">
            <h2 className="h2" style={{ color: '#fff', marginBottom: '8px' }}>Logística ágil</h2>
            <p className="muted" style={{ color: '#e5e7eb' }}>Sube fotos y gestiona tus Hbls.</p>
          </div>
        </div>
      </div>
    )
  })

  return (
    <div className="login-grid">
      <LoginHero imageUrl={imageUrl} />
      <div className="card login-card">
        <div className="login-card-content">
          <img className="login-logo" src="/src/assets/Logo-TB.png" alt="Logística ágil" />
        </div>
        <h1 className="h1">Bienvenido</h1>
        <p className="muted">Introduce tu email y contraseña para acceder.</p>
        <form onSubmit={handleSubmit(onSubmit)} className="form">
          <label className="label">
            Email
            <input className="input" type="email" placeholder="usuario@transborder.com.co" {...register('email', { required: true })} />
          </label>
          <label className="label">
            Password
            <input className="input" type="password" placeholder="contraseña" {...register('password', { required: true })} />
          </label>
          <button className="btn btn-primary" disabled={isSubmitting}>Entrar</button>
          {error && <div className="error">{error}</div>}
        </form>
      </div>
    </div>
  )
}

export default Login