import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import Layout from '../components/Layout.jsx'
import SearchBar from '../components/SearchBar.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import API from '../lib/api.js'

function BLList({ user }) {
  const [mine, setMine] = useState([])
  const [adding, setAdding] = useState(false)
  const [options, setOptions] = useState([])
  const [selected, setSelected] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 5
  const navigate = useNavigate()
  const abortRef = useRef(null)

  // Eliminar axios local y usar API compartida
  // const API = axios.create({ 
  //   baseURL: import.meta.env.PROD ? '' : '/api'
  // })

  useEffect(() => {
    // cancelar si se vuelve a montar o navegar rápido
    const controller = new AbortController()
    abortRef.current = controller
    API.get('/bls/mine', { signal: controller.signal }).then(res => {
      setMine(res.data.items || [])
    }).catch(() => setMine([]))
    return () => { abortRef.current?.abort() }
  }, [])

  function startAdd() {
    navigate('/bl/new')
  }
  
  function confirmAdd() {
    if (!selected) return
    navigate('/bl/' + selected)
  }

  const filtered = useMemo(() => {
    return mine.filter(it => {
      const matchesQuery = !query || (it.bl_id||'').toLowerCase().includes(query.toLowerCase()) || (''+(it.ol_id||''))
        .toLowerCase().includes(query.toLowerCase())
      const matchesStatus = !status || (it.send_status||'pending') === status
      return matchesQuery && matchesStatus
    })
  }, [mine, query, status])
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const start = (page - 1) * pageSize
  const end = start + pageSize
  const visible = filtered.slice(start, end)

  function statusBadge(s){
    return <StatusBadge status={s} />
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="h1">Registros Fotográficos</h1>
          <p className="muted">Gestiona y visualiza tus BLs.</p>
        </div>
        <div className="actions-row">
          {!adding && <button className="btn btn-primary" onClick={startAdd}>+ Nuevo Registro</button>}
        </div>
      </div>

      <div className="card">
        <div className="searchbar">
          <SearchBar placeholder="Buscar por OL o BL..." value={query} onChange={e => setQuery(e.target.value)} />
        </div>

        <div className="tabs">
          <button className={'tab' + (status === '' ? ' active' : '')} onClick={() => { setStatus(''); setPage(1) }}>Todos</button>
          <button className={'tab' + (status === 'sent' ? ' active' : '')} onClick={() => { setStatus('sent'); setPage(1) }}>Completo</button>
          <button className={'tab' + (status === 'pending' ? ' active' : '')} onClick={() => { setStatus('pending'); setPage(1) }}>Pendiente</button>
          <button className={'tab' + (status === 'failed' ? ' active' : '')} onClick={() => { setStatus('failed'); setPage(1) }}>Rechazado</button>
        </div>
        {adding && (
          <div className="actions" style={{ marginTop: '10px' }}>
            <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Selecciona BL...</option>
              {options.map(opt => <option key={opt.id || opt} value={opt.id || opt}>{opt.id || opt}</option>)}
            </select>
            <button className="btn btn-primary" onClick={confirmAdd} disabled={!selected}>Continuar</button>
          </div>
        )}

        <div className="table-responsive" style={{ marginTop: '12px' }}>
          <table className="table">
            <thead>
              <tr>
                <th>OL</th>
                <th>BL</th>
                <th>Fotografías</th>
                <th>Estado</th>
                <th className="table-actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(item => (
                <tr key={item.bl_id}>
                  <td>{item.ol_id || item.bl_id}</td>
                  <td>{item.bl_id}</td>
                  <td>{(item.photos_count||0)} fotos</td>
                  <td>{statusBadge(item.send_status || 'pending')}</td>
                  <td className="table-actions">
                    <button className="btn btn-outline btn-small" onClick={() => navigate('/bl/' + item.bl_id)}>Ver detalle</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <span className="muted">Mostrando {filtered.length ? (start+1) : 0}-{Math.min(end, filtered.length)} de {filtered.length} resultados</span>
          <button className="page-btn" disabled={page===1} onClick={() => setPage(p => Math.max(1, p-1))}>{'<'}</button>
          {Array.from({ length: pageCount }, (_, i) => (
            <button key={i} className={'page-btn' + (page===i+1 ? ' active' : '')} onClick={() => setPage(i+1)}>{i+1}</button>
          ))}
          <button className="page-btn" disabled={page===pageCount} onClick={() => setPage(p => Math.min(pageCount, p+1))}>{'>'}</button>
        </div>
      </div>
    </>
  )
}

export default BLList