import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import API from '../lib/api.js'

function Login({ setUser }) {
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { isSubmitting } } = useForm()
  const imageUrl = '/src/assets/banner-login.png'

  const onSubmit = async (data) => {
    try {
      const res = await API.post('/auth/login', data)
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      setUser(res.data.user)
      navigate('/panel')
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'Error desconocido'
      alert('Login falló: ' + msg)
    }
  }

  const LoginHero = React.memo(function LoginHero({ imageUrl }) {
    return (
      <div className="login-image" style={{ backgroundImage: `url(${imageUrl})` }}>
        <div className="login-overlay">
          <div className="login-overlay-content">
            <h2 className="h2" style={{ color: '#fff', marginBottom: '8px' }}>Logística ágil</h2>
            <p className="muted" style={{ color: '#e5e7eb' }}>Sube fotos y gestiona tus BLs.</p>
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
            <input className="input" type="email" placeholder="admin@empresa.com" {...register('email', { required: true })} />
          </label>
          <label className="label">
            Password
            <input className="input" type="password" placeholder="password" {...register('password', { required: true })} />
          </label>
          <button className="btn btn-primary" disabled={isSubmitting}>Entrar</button>
        </form>
      </div>
    </div>
  )
}

export default Login