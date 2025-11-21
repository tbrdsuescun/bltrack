import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import StatusBadge from '../components/StatusBadge.jsx'
import API from '../lib/api.js'

function BLList({ user }) {
  const [mastersRaw, setMastersRaw] = useState([])
  const [childrenList, setChildrenList] = useState([])
  const [mineMap, setMineMap] = useState({})
  const [page, setPage] = useState(1)
  const pageSize = 5
  const navigate = useNavigate()
  const location = useLocation()

  const master = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('master') || ''
  }, [location.search])

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem('tbMastersCache') || '{}')
      const arr = Array.isArray(v.data) ? v.data : []
      setMastersRaw(arr)
    } catch {
      setMastersRaw([])
    }
    API.get('/bls/mine').then(res => {
      const list = Array.isArray(res.data?.items) ? res.data.items : []
      const map = {}
      list.forEach(it => { map[it.bl_id] = { photos_count: it.photos_count || 0, send_status: it.send_status || 'pending' } })
      setMineMap(map)
    }).catch(() => setMineMap({}))
  }, [])

  useEffect(() => {
    if (!master) { setChildrenList([]); return }
    const ids = mastersRaw.filter(x => String(x.numeroMaster||'') === String(master)).map(x => x.numeroDo).filter(Boolean)
    setChildrenList(ids)
    setPage(1)
  }, [master, mastersRaw])

  const childrenRows = useMemo(() => {
    return childrenList.map((id) => {
      const entry = mastersRaw.find(x => String(x.numeroDo||'') === String(id)) || {}
      return {
        numeroBL: id,
        clienteNombre: entry.nombreCliente || entry.clienteNombre || '',
        clienteNit: entry.nitCliente || entry.clienteNit || '',
        numeroIE: entry.numeroIE || '',
        descripcionMercancia: entry.descripcionMercancia || '',
        numeroPedido: entry.numeroPedido || ''
      }
    })
  }, [childrenList, mastersRaw])
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
                    <th>Número BL</th>
                    <th>Nombre Cliente - NIT</th>
                    <th>Número IE</th>
                    <th>Descripción de la mercancía</th>
                    <th>Número de pedido</th>
                    <th>Fotografías</th>
                    <th>Estado</th>
                    <th className="table-actions">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(row => (
                    <tr key={row.numeroBL}>
                      <td>{row.numeroBL}</td>
                      <td>{row.clienteNombre ? (row.clienteNombre + ' - ' + (row.clienteNit || '-')) : '-'}</td>
                      <td>{row.numeroIE || '-'}</td>
                      <td>{row.descripcionMercancia || '-'}</td>
                      <td>{row.numeroPedido || '-'}</td>
                      <td>{mineMap[row.numeroBL]?.photos_count || 0}</td>
                      <td>{(mineMap[row.numeroBL]?.photos_count || 0) > 0 ? statusBadge(mineMap[row.numeroBL]?.send_status || '') : ''}</td>
                      <td className="table-actions">
                        <button className="btn btn-outline btn-small" onClick={() => navigate('/evidence/' + row.numeroBL)}>Ver detalle</button>
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
    </>
  )
}

export default BLList