import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import Layout from '../components/Layout.jsx'
import SearchBar from '../components/SearchBar.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import API from '../lib/api.js'

function Panel({ user }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ bl_id: '', status: '' })
  const [msg, setMsg] = useState(null)
  const [page, setPage] = useState(1)
  const pageSize = 5
  const navigate = useNavigate()
  const abortRef = useRef(null)
  const typingTimerRef = useRef(null)
  const [mastersRaw, setMastersRaw] = useState([])
  const [mastersListRaw, setMastersListRaw] = useState([])

  const API_local = API

  // Eliminar creación de axios ad-hoc y usar API compartida
  // const API = axios.create({ 
  //   baseURL: import.meta.env.PROD ? '' : '/api'
  // })

  // Remove per-render interceptors (ya en API compartida)
  // API.interceptors.request.use((config) => {
  //   const token = localStorage.getItem('token')
  //   if (token) {
  //     config.headers.Authorization = `Bearer ${token}`
  //   }
  //   return config
  // })

  async function load() {
    setLoading(true)
    setMsg(null)
    // cancelar solicitud anterior si existe
    if (abortRef.current) {
      try { abortRef.current.abort() } catch {}
    }
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const params = {}
      if (filters.bl_id) params.bl_id = filters.bl_id
      if (filters.status) params.status = filters.status
      const res = await API_local.get('/bls/history', { params, signal: controller.signal })
      setItems(res.data.items || [])
    } catch (err) {
      if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
        setItems([])
        setMsg('Error al cargar historial: ' + (err.response?.data?.error || err.message))
      }
    } finally {
      setLoading(false)
      // limpiar referencia si es esta misma
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  useEffect(() => { 
    load()
    return () => { abortRef.current?.abort() }
  }, [])

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem('tbMastersCache') || '{}')
      const arr = Array.isArray(v.data) ? v.data : []
      setMastersRaw(arr)
      const flagged = localStorage.getItem('mcSynced')
      if (!flagged && arr.length) {
        const items = arr.filter(x => x.numeroMaster && x.numeroDo).map(x => ({ master_id: x.numeroMaster, child_id: x.numeroDo }))
        API_local.post('/masters/sync', { items }).then(() => {
          localStorage.setItem('mcSynced', '1')
        }).catch(() => {})
      }
    } catch {
      setMastersRaw([])
    }
    API_local.get('/masters/with-photos').then(res => {
      const list = Array.isArray(res.data?.items) ? res.data.items : []
      setMastersListRaw(list)
    }).catch(() => setMastersListRaw([]))
  }, [])

  const mastersMap = useMemo(() => {
    const m = {}
    mastersRaw.forEach(x => {
      const k = x.numeroMaster || ''
      if (!k) return
      if (!m[k]) m[k] = []
      if (x.numeroDo) m[k].push(x.numeroDo)
    })
    return m
  }, [mastersRaw])

  function masterFor(blId) {
    const id = String(blId || '')
    if (mastersMap[id]) return id
    const entry = Object.entries(mastersMap).find(([k, arr]) => arr.includes(id))
    return entry ? entry[0] : id
  }

  const mastersList = useMemo(() => {
    const filtered = mastersListRaw.filter(row => !filters.bl_id || String(row.master).toLowerCase().includes(String(filters.bl_id).toLowerCase()))
    return filtered.map(row => ({ master: row.master, childrenCount: row.children_count }))
  }, [mastersListRaw, filters.bl_id])

  useEffect(() => {
    // debounce de filtros
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => { load() }, 300)
    return () => { if (typingTimerRef.current) clearTimeout(typingTimerRef.current) }
  }, [filters.bl_id, filters.status])

  function setTab(tab) {
    const map = { todos: '', completo: 'sent', pendiente: 'pending', rechazado: 'failed' }
    setFilters(prev => ({ ...prev, status: map[tab] }))
    setPage(1)
  }

  function onApplyFilters(e) { 
    e.preventDefault()
    load()
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="h1">Registros Fotográficos</h1>
          <p className="muted">Gestiona y visualiza todos los registros fotográficos.</p>
        </div>
        <div className="actions-row">
          <button className="btn btn-primary" onClick={() => navigate('/bl/new')}>+ Nuevo Registro</button>
        </div>
      </div>

      <div className="card">
        <form onSubmit={onApplyFilters}>
          <div className="searchbar">
            <SearchBar
              placeholder="Buscar por OL o BL..."
              value={filters.bl_id}
              onChange={(e) => setFilters(prev => ({ ...prev, bl_id: e.target.value }))}
            />
          </div>
        </form>

        

        {msg && <p className="muted">{msg}</p>}

        <div className="table-responsive" style={{ marginTop: '8px' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Master</th>
                <th>Usuario</th>
                <th>Hijos</th>
                <th className="table-actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {mastersList.slice((page-1)*pageSize, (page-1)*pageSize + pageSize).map((row, idx) => (
                <tr key={idx}>
                  <td>{row.master}</td>
                  <td>{(() => { try { const u = JSON.parse(localStorage.getItem('user')||'{}'); return u.nombre || u.display_name || u.email || '-' } catch { return '-' } })()}</td>
                  <td>{row.childrenCount}</td>
                  <td className="table-actions">
                    <button className="btn btn-outline btn-small" onClick={() => navigate('/bl/' + row.master)}>Ver detalle</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <span className="muted">Mostrando {mastersList.length ? ((page-1)*pageSize + 1) : 0}-{Math.min(page*pageSize, mastersList.length)} de {mastersList.length} resultados</span>
          <button className="page-btn" disabled={page===1} onClick={() => setPage(p => Math.max(1, p-1))}>{'<'}</button>
          {Array.from({ length: Math.max(1, Math.ceil(mastersList.length / pageSize)) }, (_, i) => (
            <button key={i} className={'page-btn' + (page===i+1 ? ' active' : '')} onClick={() => setPage(i+1)}>{i+1}</button>
          ))}
          <button className="page-btn" disabled={page>=Math.max(1, Math.ceil(mastersList.length / pageSize))} onClick={() => setPage(p => Math.min(Math.max(1, Math.ceil(mastersList.length / pageSize)), p+1))}>{'>'}</button>
        </div>
      </div>
    </>
  )
}

export default Panel