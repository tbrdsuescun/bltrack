import axios from 'axios'

// Instancia compartida de Axios para toda la app
const API = axios.create({
  baseURL: import.meta.env.PROD ? '' : '/api'
})

// Interceptor para adjuntar token
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default API