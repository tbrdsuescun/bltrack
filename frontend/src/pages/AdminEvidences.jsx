import React, { useEffect, useMemo, useState } from 'react'
import API from '../lib/api.js'
import SearchBar from '../components/SearchBar.jsx'
import StatusBadge from '../components/StatusBadge.jsx'

function formatDateTime(v) {
  try {
    const d = new Date(v)
    if (!Number.isFinite(d.getTime())) return '-'
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    const hh = String(d.getHours()).padStart(2, '0')
    const mi = String(d.getMinutes()).padStart(2, '0')
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`
  } catch {
    return '-'
  }
}

function imagesLabel(it) {
  const arr = Array.isArray(it?.image_names_preview) ? it.image_names_preview : []
  const txt = arr.filter(Boolean).map(s => String(s)).join(', ')
  const total = Number(it?.images_total || 0)
  if (!txt) return total > 0 ? (`${total} imágenes`) : '-'
  return total > arr.length ? `${txt} (+${total - arr.length})` : txt
}

function AdminEvidences() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const isAdmin = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem('user') || 'null')
      return u && u.role === 'admin'
    } catch {
      return false
    }
  }, [])

  async function load() {
    setLoading(true)
    setMsg(null)
    try {
      const res = await API.get('/admin/evidences/pending')
      const list = Array.isArray(res.data?.items) ? res.data.items : []
      setItems(list)
      setSelected(prev => {
        const keep = new Set()
        list.forEach(it => {
          if (prev.has(String(it.id))) keep.add(String(it.id))
        })
        return keep
      })
    } catch (err) {
      setItems([])
      setSelected(new Set())
      setMsg('Error cargando pendientes: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAdmin) return
    load()
  }, [isAdmin])

  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return items
    return items.filter(it => {
      const ref = String(it.reference_number || '').toLowerCase()
      const dn = String(it.do_number || '').toLowerCase()
      const st = String(it.status || '').toLowerCase()
      const ty = String(it.type || '').toLowerCase()
      const imgs = imagesLabel(it).toLowerCase()
      return ref.includes(q) || dn.includes(q) || st.includes(q) || ty.includes(q) || imgs.includes(q)
    })
  }, [items, query])

  const [page, setPage] = useState(1)
  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  useEffect(() => { setPage(1) }, [query])

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, page])

  const allOnPageSelected = useMemo(() => {
    if (!pageItems.length) return false
    return pageItems.every(it => selected.has(String(it.id)))
  }, [pageItems, selected])

  function toggleOne(id) {
    const k = String(id)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  function toggleAllOnPage() {
    setSelected(prev => {
      const next = new Set(prev)
      const ids = pageItems.map(it => String(it.id))
      const all = ids.length > 0 && ids.every(id => next.has(id))
      ids.forEach(id => {
        if (all) next.delete(id)
        else next.add(id)
      })
      return next
    })
  }

  async function resendSelected() {
    const ids = Array.from(selected).map(x => Number(x)).filter(n => Number.isFinite(n) && n > 0)
    if (!ids.length) return
    setLoading(true)
    setMsg(null)
    try {
      const res = await API.post('/admin/evidences/resend', { ids })
      const results = Array.isArray(res.data?.results) ? res.data.results : []
      const ok = results.filter(r => r && r.ok && r.status === 'sent').length
      const skipped = results.filter(r => r && r.ok && r.skipped).length
      const fail = results.filter(r => r && !r.ok).length
      setMsg(`Reenvío terminado. Enviadas: ${ok}. Omitidas: ${skipped}. Fallidas: ${fail}.`)
      await load()
    } catch (err) {
      setMsg('Error reenviando: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="card">
        <h1 className="h1">Evidencias</h1>
        <p className="muted">Sin permisos.</p>
      </div>
    )
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="h1">Reenvío de Evidencias</h1>
          <p className="muted">Lista de registros con estado pendiente de enviar al servidor domino.</p>
        </div>
        <div className="actions-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={load} disabled={loading}>Refrescar</button>
          <button className="btn btn-primary" onClick={resendSelected} disabled={loading || selected.size === 0}>Reenviar seleccionadas ({selected.size})</button>
        </div>
      </div>

      <div className="card">
        {msg && <p className="muted">{msg}</p>}
        <div className="searchbar">
          <SearchBar placeholder="Buscar por referencia, DO, imagen, estado o tipo" value={query} onChange={e => setQuery(e.target.value)} />
        </div>

        {filtered.length === 0 ? (
          <p className="muted">No hay registros pendientes.</p>
        ) : (
          isMobile ? (
            <div className="mobile-card-list" style={{ marginTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} />
                <span className="muted">Seleccionar todos (página)</span>
              </div>
              {pageItems.map(it => (
                <div key={it.id} className="mobile-card">
                  <div className="mobile-card-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <input type="checkbox" checked={selected.has(String(it.id))} onChange={() => toggleOne(it.id)} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{it.reference_number || '-'}</div>
                        <div className="muted" style={{ fontSize: 12 }}>DO: {it.do_number || '-'} · {String(it.type || '').toUpperCase()}</div>
                        <div className="muted" style={{ fontSize: 12 }}>Imágenes: {imagesLabel(it)}</div>
                      </div>
                    </div>
                    <div><StatusBadge status={it.status} /></div>
                  </div>
                  <div className="mobile-card-body">
                    <div>
                      <div className="muted">Fecha</div>
                      <div>{formatDateTime(it.created_at)}</div>
                    </div>
                    <div>
                      <div className="muted">Docs</div>
                      <div>{Number(it.documents_count || 0)}</div>
                    </div>
                  </div>
                  {it.error_message ? (
                    <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                      Error: {it.error_message}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="table-responsive" style={{ marginTop: '10px' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} />
                    </th>
                    <th>Referencia</th>
                    <th>DO</th>
                    <th>Tipo</th>
                    <th>Imágenes</th>
                    <th>Fecha</th>
                    <th>Docs</th>
                    <th>Estado</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map(it => (
                    <tr key={it.id}>
                      <td>
                        <input type="checkbox" checked={selected.has(String(it.id))} onChange={() => toggleOne(it.id)} />
                      </td>
                      <td>{it.reference_number || '-'}</td>
                      <td>{it.do_number || '-'}</td>
                      <td>{String(it.type || '').toUpperCase()}</td>
                      <td className="muted" style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{imagesLabel(it)}</td>
                      <td>{formatDateTime(it.created_at)}</td>
                      <td>{Number(it.documents_count || 0)}</td>
                      <td><StatusBadge status={it.status} /></td>
                      <td className="muted" style={{ maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {it.error_message || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {filtered.length > 0 ? (
          <div className="pagination">
            <span className="muted">Mostrando {filtered.length ? ((page - 1) * pageSize + 1) : 0}-{Math.min(page * pageSize, filtered.length)} de {filtered.length} resultados</span>
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

export default AdminEvidences

