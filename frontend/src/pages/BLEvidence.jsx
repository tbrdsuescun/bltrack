import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import API from '../lib/api.js'
import SearchBar from '../components/SearchBar.jsx'

function BLEvidence() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const fileInputRef = useRef()
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [cacheEntry, setCacheEntry] = useState(null)

  useEffect(() => {
    let mounted = true
    API.get('/bls/' + id + '/photos').then(res => {
      if (!mounted) return
      const list = Array.isArray(res.data?.photos) ? res.data.photos : []
      setPhotos(list)
    }).catch(() => setPhotos([]))
    try {
      const cache = JSON.parse(localStorage.getItem('tbMastersCache') || '{}')
      const arr = Array.isArray(cache.data) ? cache.data : []
      const entryChild = arr.find(x => (x.numeroMaster || '') && (x.numeroDo || '') && String(x.numeroDo) === String(id))
      const entryMaster = arr.find(x => (x.numeroMaster || '') && String(x.numeroMaster) === String(id))
      const entry = entryChild || entryMaster || null
      if (entry) setCacheEntry(entry)
    } catch {}
    return () => { mounted = false }
  }, [id])

  const orderedPhotos = useMemo(() => {
    const parseTs = (p) => {
      const raw = String(p.id || '')
      const n = Number((raw.split('-')[0]) || 0)
      return Number.isFinite(n) ? n : 0
    }
    return (photos || [])
      .filter(p => p && p.id)
      .slice()
      .sort((a, b) => parseTs(a) - parseTs(b))
  }, [photos])

  async function onUpload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length || !id) return
    const fd = new FormData()
    files.forEach(f => fd.append('photos', f))
    try {
      const cache = JSON.parse(localStorage.getItem('tbMastersCache') || '{}')
      const arr = Array.isArray(cache.data) ? cache.data : []
      const entryChild = arr.find(x => (x.numeroDo || '') && String(x.numeroDo) === String(id))
      const entryMaster = arr.find(x => (x.numeroMaster || '') && String(x.numeroMaster) === String(id))
      const isMaster = !!entryMaster && !entryChild
      const entry = entryChild || entryMaster || null
      const masterId = isMaster ? String(id) : String((entry && (entry.numeroMaster || entry.numeroDo)) || id)
      const childId = isMaster ? '' : String((entry && entry.numeroDo) || id)
      fd.append('master_id', masterId)
      fd.append('child_id', childId)
      if (entry) {
        fd.append('cliente_nombre', String(entry.nombreCliente || entry.clienteNombre || entry.razonSocial || entry.nombre || ''))
        fd.append('cliente_nit', String(entry.nitCliente || entry.clienteNit || entry.nit || ''))
        fd.append('numero_ie', String(entry.numeroIE || entry.ie || entry.ieNumber || ''))
        fd.append('descripcion_mercancia', String(entry.descripcionMercancia || entry.descripcion || ''))
        fd.append('numero_pedido', String(entry.numeroPedido || entry.pedido || entry.orderNumber || ''))
      }
    } catch {}
    setLoading(true)
    try {
      const res = await API.post('/bls/' + id + '/photos', fd)
      const newPhotos = (res.data.photos || []).map(p => ({ ...p, url: p.id ? ('/uploads/' + p.id) : p.url }))
      setPhotos(prev => prev.concat(newPhotos))
      setStatus('Fotos cargadas: ' + newPhotos.length)
      // masters/sync ya se envía junto con la subida; se mantiene compatible sin segunda llamada
    } catch (err) {
      setStatus('Error al subir fotos: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
    }
  }

  const [confirmPhoto, setConfirmPhoto] = useState(null)
  async function onDeleteConfirmed() {
    const photoId = confirmPhoto?.id
    if (!photoId) { setConfirmPhoto(null); return }
    setLoading(true)
    try {
      const res = await API.delete('/photos/' + photoId)
      if (res.data?.deleted) {
        setPhotos(prev => prev.filter(p => p.id !== photoId))
        setStatus('Foto eliminada')
      } else {
        setStatus('No se pudo eliminar la foto')
      }
    } catch (err) {
      setStatus('Error al eliminar: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
      setConfirmPhoto(null)
    }
  }

  async function onSave() {
    if (!id) return
    setLoading(true)
    try {
      try {
        const entry = cacheEntry || (() => {
          try {
            const cache = JSON.parse(localStorage.getItem('tbMastersCache') || '{}')
            const arr = Array.isArray(cache.data) ? cache.data : []
            const byChild = arr.find(x => (x.numeroMaster || '') && (x.numeroDo || '') && String(x.numeroDo) === String(id))
            if (byChild) return byChild
            const byMaster = arr.find(x => (x.numeroMaster || '') && String(x.numeroMaster) === String(id))
            return byMaster || null
          } catch { return null }
        })()
        if (entry) {
          const isMaster = String(entry.numeroMaster || '') === String(id) && String(entry.numeroDo || '') !== String(id)
          const item = {
            master_id: isMaster ? id : entry.numeroMaster,
            child_id: isMaster ? undefined : entry.numeroDo,
            cliente_nombre: entry.nombreCliente || entry.clienteNombre || entry.razonSocial || entry.nombre || undefined,
            cliente_nit: entry.nitCliente || entry.clienteNit || entry.nit || undefined,
            numero_ie: entry.numeroIE || entry.ie || entry.ieNumber || undefined,
            descripcion_mercancia: entry.descripcionMercancia || entry.descripcion || undefined,
            numero_pedido: entry.numeroPedido || entry.pedido || entry.orderNumber || undefined,
          }
          await API.post('/masters/sync', { items: [item] })
        }
      } catch {}
      const res = await API.post('/bls/' + id + '/send', {})
      setStatus('Guardado: ' + (res.data.status || 'ok'))
    } catch (err) {
      setStatus('Error al guardar: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
    }
  }

  function openFileDialog(){ fileInputRef.current?.click() }
  function onDrop(e){ e.preventDefault(); const files = Array.from(e.dataTransfer?.files || []); if (!files.length) return; const synthetic = { target: { files } }; onUpload(synthetic) }
  function onDragOver(e){ e.preventDefault() }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="h1">Evidencia Fotográfica</h1>
          <p className="muted">BL {id}</p>
        </div>
        <div className="actions-row">
          <button className="btn btn-outline" onClick={() => navigate(-1)}>← Volver</button>
        </div>
      </div>

      <div className="card">
        
        <div style={{ marginTop:'12px' }}>
          <h2 className="h2">Evidencia</h2>
          <div className="dropzone" onClick={openFileDialog} onDrop={onDrop} onDragOver={onDragOver}>Arrastra y suelta archivos aquí<br/>o haz clic para buscar</div>
          <div className="actions" style={{ justifyContent:'flex-start' }}>
            <button className="btn btn-primary" onClick={openFileDialog}>Subir Archivo</button>
            <button className="btn btn-outline" onClick={openFileDialog}>Tomar Foto</button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" style={{ display:'none' }} onChange={onUpload} disabled={loading} />
        </div>

        {status && <p className="muted">{status}</p>}

        {orderedPhotos.length === 0 ? (
          <p className="muted">Aún no hay fotos para este BL.</p>
        ) : (
          <div className="table-responsive" style={{ marginTop: '12px' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Foto</th>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Nombre</th>
                  <th className="table-actions">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {orderedPhotos.map(p => {
                  const ts = Number((String(p.id||'').split('-')[0]) || 0)
                  const fecha = ts ? dayjs(ts).format('YYYY-MM-DD HH:mm') : '-'
                  const user = (() => { try { return JSON.parse(localStorage.getItem('user')||'{}') } catch { return {} } })()
                  const usuario = user?.nombre || user?.display_name || user?.email || '-'
                  return (
                    <tr key={p.id}>
                      <td>
                        {p.url ? (
                          <img src={p.url} alt={p.filename || p.id} style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in' }} onClick={() => setSelectedPhoto(p)} />
                        ) : (
                          <span className="muted">(sin vista previa)</span>
                        )}
                      </td>
                      <td>{fecha}</td>
                      <td>{usuario}</td>
                      <td>{p.filename || p.id}</td>
                      <td className="table-actions">
                        <button className="btn btn-outline btn-small" onClick={() => setSelectedPhoto(p)}>Ver foto</button>
                        <button className="btn btn-danger btn-small" onClick={() => setConfirmPhoto(p)} disabled={loading}>Eliminar</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="actions" style={{ justifyContent:'flex-end' }}>
          <button className="btn btn-outline" onClick={onSave} disabled={loading}>Guardar</button>
        </div>
      </div>

      {selectedPhoto && (
        <div className="modal-backdrop" onClick={() => setSelectedPhoto(null)}>
          <div className="modal" style={{ width: '70%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Vista de foto</span>
              <button type="button" className="btn btn-outline btn-small" style={{ fontSize: '1.5rem' }} onClick={() => setSelectedPhoto(null)}>×</button>
            </div>
            <div className="modal-body">
              {selectedPhoto?.url ? (
                <img src={selectedPhoto.url} alt={selectedPhoto.filename || selectedPhoto.id} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
              ) : (
                <div className="muted">No disponible</div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setSelectedPhoto(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {confirmPhoto && (
        <div className="modal-backdrop" onClick={() => setConfirmPhoto(null)}>
          <div className="modal" style={{ width: '420px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Confirmar eliminación</span>
              <button type="button" className="btn btn-outline btn-small" style={{ fontSize: '1.5rem' }} onClick={() => setConfirmPhoto(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                {confirmPhoto?.url ? <img src={confirmPhoto.url} alt={confirmPhoto.filename || confirmPhoto.id} style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6 }} /> : null}
                <div>
                  <div>¿Eliminar la foto <strong>{confirmPhoto?.filename || confirmPhoto?.id}</strong>?</div>
                  <div className="muted" style={{ fontSize:12 }}>Esta acción no se puede deshacer.</div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setConfirmPhoto(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={onDeleteConfirmed} disabled={loading}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default BLEvidence