import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import StatusBadge from '../components/StatusBadge.jsx'
import API from '../lib/api.js'

function BLList({ user }) {

  const [childrenList, setChildrenList] = useState([])
  const [mineMap, setMineMap] = useState({})
  const [page, setPage] = useState(1)
  const pageSize = 5
  const navigate = useNavigate()
  const location = useLocation()
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  const [loading, setLoading] = useState(false)

  const master = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('master') || ''
  }, [location.search])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    API.get('/bls/mine').then(res => {
      const list = Array.isArray(res.data?.items) ? res.data.items : []
      const map = {}
      list.forEach(it => { map[it.bl_id] = { photos_count: it.photos_count || 0, send_status: it.send_status || 'pending' } })
      setMineMap(map)
    }).catch(() => setMineMap({}))

    if (master) {
      setLoading(true)
      API.get(`/bls/master/${master}/children`).then(res => {
        const list = Array.isArray(res.data?.items) ? res.data.items : []
        setChildrenList(list)
      }).catch(() => {
        setChildrenList([])
      }).finally(() => setLoading(false))
    } else {
      setChildrenList([])
      setLoading(false)
    }
    setPage(1)
  }, [master])

  const childrenRows = useMemo(() => {
    return childrenList.map((entry) => {
      return {
        numeroHBL: entry.child_id || '',
        clienteNombre: entry.cliente_nombre || '',
        puertoOrigen: entry.puerto_de_origen || '',
        numeroIE: entry.numero_ie || '',
        numeroDO: entry.numero_DO_hijo || '',
        paisOrigen: entry.pais_de_origen || '',
      }
    })
  }, [childrenList])
  const pageCount = Math.max(1, Math.ceil(childrenRows.length / pageSize))
  const start = (page - 1) * pageSize
  const end = start + pageSize
  const visible = childrenRows.slice(start, end)

  function statusBadge(s){
    return <StatusBadge status={s} />
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="h1">Registros Fotográficos</h1>
          <p className="muted">Master {master || '-'}</p>
        </div>
        <div className="actions-row">
          <button className="btn btn-outline" onClick={() => navigate(-1)}>← Volver</button>
          <button className="btn btn-primary" onClick={() => navigate('/bl/new')}>+ Nuevo Registro</button>
        </div>
      </div>

      <div className="card">
        {(!master || childrenRows.length === 0) ? (
          <p className="muted" style={{ marginTop: '12px' }}>No hay registros para mostrar.</p>
        ) : (
          <>
            <div className="table-responsive" style={{ marginTop: '12px' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Puerto Origen</th>
                    <th>Número IE</th>
                    <th>Número DO</th>
                    <th>País Origen</th>
                    <th>Número HBL</th>
                    <th>Fotografías</th>
                    <th className="table-actions">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(row => (
                    <tr key={row.numeroHBL}>
                      <td>{row.clienteNombre || '-'}</td>
                      <td>{row.puertoOrigen || '-'}</td>
                      <td>{row.numeroIE || '-'}</td>
                      <td>{row.numeroDO || '-'}</td>
                      <td>{row.paisOrigen || '-'}</td>
                      <td>{row.numeroHBL}</td>
                      <td>{mineMap[row.numeroHBL]?.photos_count || 0}</td>
                      <td className="table-actions">
                        <button className="btn btn-outline btn-small" onClick={() => navigate(`/evidence/${master}/${row.numeroHBL}`)}>Ver detalle</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <span className="muted">Mostrando {childrenRows.length ? (start+1) : 0}-{Math.min(end, childrenRows.length)} de {childrenRows.length} resultados</span>
              <button className="page-btn" disabled={page===1} onClick={() => setPage(p => Math.max(1, p-1))}>{'<'}</button>
              {Array.from({ length: pageCount }, (_, i) => (
                <button key={i} className={'page-btn' + (page===i+1 ? ' active' : '')} onClick={() => setPage(i+1)}>{i+1}</button>
              ))}
              <button className="page-btn" disabled={page===pageCount} onClick={() => setPage(p => Math.min(pageCount, p+1))}>{'>'}</button>
            </div>
          </>
        )}
      </div>

      {loading && (
        <div className="loading-backdrop" aria-live="polite" aria-busy="true">
          <div className="loading-spinner"></div>
          <div className="loading-text">Cargando...</div>
        </div>
      )}

      {isMobile && (
        <button className="fab btn-primary" onClick={() => navigate('/bl/new')} aria-label="Nuevo registro">
          <span className="icon">+</span>
        </button>
      )}
    </>
  )
}

export default BLList