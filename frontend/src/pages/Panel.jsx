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
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  const abortRef = useRef(null)
  const typingTimerRef = useRef(null)
  const [mastersRaw, setMastersRaw] = useState([])
  const [mastersListRaw, setMastersListRaw] = useState([])
  const [mastersLoading, setMastersLoading] = useState(false)

  const API_local = API

  const isAdmin = (() => { try { const u = JSON.parse(localStorage.getItem('user') || '{}'); return String(u.role || '') === 'admin' } catch { return false } })()

  async function load() {
    setLoading(true)
    setMsg(null)
    // cancelar solicitud anterior si existe
    if (abortRef.current) {
      try { abortRef.current.abort() } catch { }
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

  useEffect(() => { load(); return () => { abortRef.current?.abort() } }, [])
  useEffect(() => { const onResize = () => setIsMobile(window.innerWidth <= 768); window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize) }, [])

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem('tbMastersCache') || '{}')
      const arr = Array.isArray(v.data) ? v.data : []
      setMastersRaw(arr)
    } catch {
      setMastersRaw([])
    }
    const endpoint = isAdmin ? '/masters' : '/masters/with-photos'
    setMastersLoading(true)
    API_local.get(endpoint).then(res => {
      const list = Array.isArray(res.data?.items) ? res.data.items : []
      setMastersListRaw(list)
    }).catch(() => setMastersListRaw([])).finally(() => setMastersLoading(false))
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
    const term = String(filters.bl_id || '').toLowerCase()
    const filtered = mastersListRaw.filter(row => {
      if (!term) return true
      const masterStr = String(row.master || '').toLowerCase()
      const doStr = String(row.numero_DO_master || '').toLowerCase()
      const usersStr = Array.isArray(row.users) ? row.users.map(u => String(u.nombre || u.display_name || u.email || '').toLowerCase()).join(' ') : ''
      const puertosStr = Array.isArray(row.users) ? row.users.map(u => String(u.puerto || '').toLowerCase()).join(' ') : ''
      return masterStr.includes(term) || doStr.includes(term) || usersStr.includes(term) || puertosStr.includes(term)
    })
    return filtered.map(row => ({ master: row.master, doNumber: String(row.numero_DO_master || ''), childrenCount: Number(row.children_count || 0), photosCount: Number(row.photos_count_master || 0), users: Array.isArray(row.users) ? row.users : [] }))
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
          {!isAdmin && (
            <button className="btn btn-primary" onClick={() => navigate('/bl/new')}>+ Nuevo Registro</button>
          )}
        </div>
      </div>

      <div className="card">
        <form onSubmit={onApplyFilters}>
          <div className="searchbar">
            <SearchBar
              placeholder="Filtra por Master, Usuario o Puerto..."
              value={filters.bl_id}
              onChange={(e) => setFilters(prev => ({ ...prev, bl_id: e.target.value }))}
            />
          </div>
        </form>



        {msg && <p className="muted">{msg}</p>}

        {mastersLoading ? (
          <div className="loading-backdrop" aria-live="polite" aria-busy="true">
            <div className="loading-spinner"></div>
            <div className="loading-text">Cargando...</div>
          </div>
        ) : mastersList.length === 0 ? (
          <p className="muted">No hay registros para mostrar.</p>
        ) : (
          <>
            {isMobile ? (
              <div className="mobile-card-list">
                {mastersList.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize).map((row, idx) => (
                  <div key={idx} className="mobile-card">
                    <div className="mobile-card-header">
                      <div style={{ fontWeight: 600 }}>{row.master}</div>
                      <div className="muted">Fotos: {row.photosCount}</div>
                    </div>
                    <div className="mobile-card-body">
                      <div>
                        <div className="muted">N° DO master</div>
                        <div>{row.doNumber || '-'}</div>
                      </div>
                      <div>
                        <div className="muted">N° Hbls</div>
                        <div>{row.childrenCount || 0}</div>
                      </div>
                      {isAdmin ? (
                        <div>
                          <div className="muted">Usuarios</div>
                          <div>{(row.users || []).map(u => u.nombre || u.display_name || u.email).filter(Boolean).join(', ') || '-'}</div>
                        </div>
                      ) : null}
                      {isAdmin ? (
                        <div>
                          <div className="muted">Puertos</div>
                          <div>{Array.from(new Set((row.users || []).map(u => u.puerto).filter(Boolean))).join(', ') || '-'}</div>
                        </div>
                      ) : null}
                    </div>
                    <div className="mobile-card-actions" style={{ marginTop: 8 }}>
                      <button className="btn btn-outline btn-small" onClick={() => {
                        const hasChildren = Number(row.childrenCount) > 0
                        navigate(hasChildren ? '/bl?master=' + encodeURIComponent(row.master) : '/evidence/' + row.master)
                      }}>Ver HBLS</button>
                      {Number(row.childrenCount) > 0 && (
                        <button className="btn btn-outline btn-small" onClick={() => {
                          navigate('/evidence/' + row.master)
                        }}>Ver Master</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="table-responsive" style={{ marginTop: '8px' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Master</th>
                      {isAdmin ? <th>Usuarios</th> : null}
                      {isAdmin ? <th>Puertos</th> : null}
                      <th>Fotografías master</th>
                      <th>Número DO master</th>
                      <th>N° Hbls</th>
                      <th className="table-actions">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mastersList.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize).map((row, idx) => (
                      <tr key={idx}>
                        <td style={{ cursor: 'pointer', color: '#06467c' }} onClick={() => { const hasChildren = Number(row.childrenCount) > 0; navigate(hasChildren ? '/bl?master=' + encodeURIComponent(row.master) : '/evidence/' + row.master) }}>{row.master}</td>
                        {isAdmin ? (
                          <td>{(row.users || []).map(u => u.nombre || u.display_name || u.email).filter(Boolean).join(', ') || '-'}</td>
                        ) : null}
                        {isAdmin ? (
                          <td>{Array.from(new Set((row.users || []).map(u => u.puerto).filter(Boolean))).join(', ') || '-'}</td>
                        ) : null}
                        <td>{row.photosCount}</td>
                        <td>{row.doNumber}</td>
                        <td>{row.childrenCount}</td>
                        <td className="table-actions">
                          <button className="btn btn-outline btn-small" onClick={() => {
                            const hasChildren = Number(row.childrenCount) > 0
                            navigate(hasChildren ? '/bl?master=' + encodeURIComponent(row.master) : '/evidence/' + row.master)
                          }}>Ver HBLS</button>
                          {Number(row.childrenCount) > 0 && (
                            <button className="btn btn-outline btn-small" onClick={() => {
                              navigate('/evidence/' + row.master)
                            }}>Ver Master</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="pagination">
              <span className="muted">Mostrando {mastersList.length ? ((page - 1) * pageSize + 1) : 0}-{Math.min(page * pageSize, mastersList.length)} de {mastersList.length} resultados</span>
              <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>{'<'}</button>
              {Array.from({ length: Math.max(1, Math.ceil(mastersList.length / pageSize)) }, (_, i) => (
                <button key={i} className={'page-btn' + (page === i + 1 ? ' active' : '')} onClick={() => setPage(i + 1)}>{i + 1}</button>
              ))}
              <button className="page-btn" disabled={page >= Math.max(1, Math.ceil(mastersList.length / pageSize))} onClick={() => setPage(p => Math.min(Math.max(1, Math.ceil(mastersList.length / pageSize)), p + 1))}>{'>'}</button>
            </div>
          </>
        )}
      </div>

      {isMobile && !isAdmin && (
        <button className="fab btn-primary" onClick={() => navigate('/bl/new')} aria-label="Nuevo registro">
          <span className="icon">+</span>
        </button>
      )}
    </>
  )
}

export default Panel
