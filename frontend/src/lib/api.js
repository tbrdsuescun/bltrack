import axios from 'axios'

// Instancia compartida de Axios para toda la app
const base = (import.meta.env?.VITE_API_BASE_URL) || (import.meta.env.PROD ? '' : '/api')
const API = axios.create({
  baseURL: base
})

// Interceptor para adjuntar token
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Interceptor de respuesta: si el servidor responde 401, cerrar sesión automáticamente
API.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      try { window.AppLogout?.() } catch {}
    }
    return Promise.reject(err)
  }
)

export const EVIDENCE_ENDPOINT = (import.meta.env?.VITE_EVIDENCE_ENDPOINT) || '/evidences/submit'
export default API
