import React, { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import API from '../lib/api.js'
import SearchBar from '../components/SearchBar.jsx'

function formatType(value) {
  return String(value || '').toLowerCase() === 'master' ? 'MASTER' : 'HIJO'
}

function buildExportName(from, to) {
  const parts = ['evidencias-enviadas']
  if (from) parts.push(`desde-${from}`)
  if (to) parts.push(`hasta-${to}`)
  return `${parts.join('_')}.xlsx`
}

function AdminSentEvidences() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [hasSearched, setHasSearched] = useState(false)

  const isAdmin = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || 'null')
      return u && u.role === 'admin'
    } catch {
      return false
    }
  }, [])

  async function load(nextFilters) {
    const filters = nextFilters || { from, to }
    if (!filters.from && !filters.to) {
      setItems([])
      setMsg(null)
      return
    }
    setLoading(true)
    setMsg(null)
    try {
      const params = { limit: 5000 }
      if (filters.from) params.from = filters.from
      if (filters.to) params.to = filters.to
      const res = await API.get('/evidences/admin/sent', { params })
      const list = Array.isArray(res.data?.items) ? res.data.items : []
      setItems(list)
    } catch (err) {
      setItems([])
      setMsg('Error cargando evidencias enviadas: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAdmin) return
    setItems([])
    setMsg(null)
  }, [isAdmin])

  const filteredItems = useMemo(() => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return items
    return items.filter(it => {
      return [
        it.reference_number,
        it.master,
        it.do_number,
        it.type,
        it.effective_date,
        it.images_total
      ].some(v => String(v || '').toLowerCase().includes(q))
    })
  }, [items, query])

  useEffect(() => {
    setPage(1)
  }, [query, items])

  const pageSize = 20
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize))
  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredItems.slice(start, start + pageSize)
  }, [filteredItems, page])

  function onSubmitFilters(e) {
    e.preventDefault()
    if (!from || !to) {
      setHasSearched(false)
      setItems([])
      setMsg('Debes seleccionar fecha desde y fecha hasta para consultar.')
      return
    }
    if (from > to) {
      setHasSearched(false)
      setItems([])
      setMsg('La fecha desde no puede ser mayor que la fecha hasta.')
      return
    }
    setHasSearched(true)
    load({ from, to })
  }

  function clearFilters() {
    setFrom('')
    setTo('')
    setQuery('')
    setPage(1)
    setHasSearched(false)
    setItems([])
    setMsg(null)
  }

  function exportExcel() {
    if (!filteredItems.length) return
    const rows = filteredItems.map(it => ({
      Referencia: it.reference_number || '-',
      Master: it.master || '-',
      DO: it.do_number || '-',
      Tipo: it.type || '-',
      Fecha: it.effective_date || '-'
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [
      { wch: 24 },
      { wch: 24 },
      { wch: 18 },
      { wch: 20 },
      { wch: 12 }
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Enviadas')
    XLSX.writeFile(wb, buildExportName(from, to))
  }

  if (!isAdmin) {
    return (
      <div className="card">
        <h1 className="h1">Evidencias Enviadas</h1>
        <p className="muted">Sin permisos.</p>
      </div>
    )
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="h1">Evidencias Enviadas</h1>
          <p className="muted">Consulta evidencias con estado `sent` en una tabla plana usando fecha desde y fecha hasta.</p>
        </div>
        <div className="actions-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={() => load({ from, to })} disabled={loading || !hasSearched}>Refrescar</button>
          <button className="btn btn-primary" onClick={exportExcel} disabled={loading || !hasSearched || filteredItems.length === 0}>Exportar Excel</button>
        </div>
      </div>

      <div className="card">
        {msg ? <p className="muted">{msg}</p> : null}

        <form onSubmit={onSubmitFilters} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'end' }}>
          <label className="label">
            Desde
            <input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </label>
          <label className="label">
            Hasta
            <input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? 'Consultando...' : 'Filtrar'}</button>
            <button className="btn btn-outline" type="button" onClick={clearFilters} disabled={loading}>Limpiar</button>
          </div>
        </form>

        <div className="searchbar" style={{ marginTop: 12 }}>
          <SearchBar placeholder="Buscar por referencia, master, DO, tipo o fecha" value={query} onChange={e => setQuery(e.target.value)} />
        </div>

        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div className="muted">Registros: {hasSearched ? filteredItems.length : 0}</div>
          <div className="muted">{hasSearched ? 'Mostrando registros enviados filtrados.' : 'Selecciona el rango de fechas para consultar.'}</div>
        </div>

        {filteredItems.length === 0 ? (
          <p className="muted" style={{ marginTop: 16 }}>
            {loading
              ? 'Cargando resultados...'
              : (hasSearched
                ? 'No hay evidencias enviadas para los filtros seleccionados.'
                : 'Selecciona fecha desde y fecha hasta, luego presiona Filtrar.')}
          </p>
        ) : (
          <div className="table-responsive" style={{ marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Referencia</th>
                  <th>Master</th>
                  <th>DO</th>
                  <th>Tipo</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map(item => (
                  <tr key={`${item.type}-${item.master}-${item.reference_number}`}>
                    <td>{item.reference_number || '-'}</td>
                    <td>{item.master || '-'}</td>
                    <td>{item.do_number || '-'}</td>
                    <td>{item.type || '-'}</td>
                    <td>{item.effective_date || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredItems.length > 0 ? (
          <div className="pagination">
            <span className="muted">Mostrando {filteredItems.length ? ((page - 1) * pageSize + 1) : 0}-{Math.min(page * pageSize, filteredItems.length)} de {filteredItems.length} resultados</span>
            <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>{'<'}</button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i} className={'page-btn' + (page === i + 1 ? ' active' : '')} onClick={() => setPage(i + 1)}>{i + 1}</button>
            ))}
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>{'>'}</button>
          </div>
        ) : null}
      </div>
    </>
  )
}

export default AdminSentEvidences
