import axios from 'axios'

const base = (import.meta.env?.VITE_API_BASE_URL) || (import.meta.env.PROD ? '' : '/api')
const API = axios.create({
  baseURL: base,
  timeout: 180000
})

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

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
