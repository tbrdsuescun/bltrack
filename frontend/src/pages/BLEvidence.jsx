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
  const [isMaster, setIsMaster] = useState(false)
  const [selectedPrefix, setSelectedPrefix] = useState('')
  const [childUseAveria, setChildUseAveria] = useState(false)
  const [counters, setCounters] = useState({})
  const [prefixModalOpen, setPrefixModalOpen] = useState(false)
  const [prefixError, setPrefixError] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const PREFIXES = [
    { label: 'Contenedor cerrado', slug: 'contenedor_cerrado' },
    { label: 'Contenedor abierto', slug: 'contenedor_abierto' },
    { label: 'No. de contenedor', slug: 'no_de_contenedor' },
    { label: 'Sello', slug: 'sello' },
    { label: 'Líneas de cargue', slug: 'lineas_de_cargue' },
    { label: 'Avería', slug: 'averia' },
    { label: 'SGA', slug: 'sga' },
    { label: 'Contenedor vacío ( lado izquierdo, lado derecho, piso, techo.)', slug: 'contenedor_vacio' },
    { label: 'Tarja', slug: 'tarja' },
    { label: 'Acta de avería', slug: 'acta_de_averia' },
  ]

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
      setIsMaster(!!entryMaster && !entryChild)
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

  useEffect(() => {
    const next = {}
    const list = Array.isArray(photos) ? photos : []
    PREFIXES.forEach(p => { next[p.slug] = 1 })
    list.forEach(p => {
      const name = String(p.filename || '')
      PREFIXES.forEach(px => {
        const prefix = px.slug + '_'
        if (name.startsWith(prefix)) {
          const rest = name.slice(prefix.length)
          const num = Number((rest.split('.')[0]) || rest)
          if (Number.isFinite(num)) next[px.slug] = Math.max(next[px.slug] || 1, num + 1)
        }
      })
    })
    setCounters(next)
  }, [photos])

  async function onUpload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length || !id) return
    if (isMaster && !selectedPrefix) { setStatus('Selecciona un prefijo para nombrar las fotos'); setPrefixError(true); setPrefixModalOpen(true); return }
    setLoading(true)
    let filesToUse = files
    try {
      const cache = JSON.parse(localStorage.getItem('tbMastersCache') || '{}')
      const arr = Array.isArray(cache.data) ? cache.data : []
      const entryChild = arr.find(x => (x.numeroDo || '') && String(x.numeroDo) === String(id))
      const entryMaster = arr.find(x => (x.numeroMaster || '') && String(x.numeroMaster) === String(id))
      const isMasterLocal = !!entryMaster && !entryChild
      const entry = entryChild || entryMaster || null
      if (isMaster && selectedPrefix) {
        const slug = selectedPrefix
        const start = Math.max(1, Number(counters[slug] || 1))
        filesToUse = files.map((f, i) => {
          const original = String(f.name || '')
          const dot = original.lastIndexOf('.')
          const ext = dot >= 0 ? original.slice(dot) : ''
          const newName = `${slug}_${start + i}${ext}`
          return new File([f], newName, { type: f.type })
        })
      } else if (!isMaster) {
        const hblName = String(entryChild?.numeroHBL || entry?.numeroHBL || entryChild?.hbl || '').trim()
        const prefix = childUseAveria ? 'avería' : (hblName ? ('hbl_' + hblName) : 'hbl')
        const getNextIndex = (pref) => {
          let max = 0
          const list = Array.isArray(photos) ? photos : []
          list.forEach(p => {
            const name = String(p.filename || '')
            const target = pref + '_'
            if (name.startsWith(target)) {
              const rest = name.slice(target.length)
              const num = Number((rest.split('.')[0]) || rest)
              if (Number.isFinite(num)) { max = Math.max(max, num) }
            }
          })
          return max + 1
        }
        const start = getNextIndex(prefix)
        filesToUse = files.map((f, i) => {
          const original = String(f.name || '')
          const dot = original.lastIndexOf('.')
          const ext = dot >= 0 ? original.slice(dot) : ''
          const newName = `${prefix}_${start + i}${ext}`
          return new File([f], newName, { type: f.type })
        })
      }
      const now = Date.now()
      const staged = filesToUse.map((f, i) => ({ id: `${now + i}-local`, filename: f.name, url: URL.createObjectURL(f) }))
      setPendingFiles(prev => prev.concat(filesToUse))
      setPhotos(prev => prev.concat(staged))
      setStatus('Fotos preparadas: ' + staged.length)
      if (isMaster && selectedPrefix) {
        const slug = selectedPrefix
        const inc = filesToUse.length
        setCounters(prev => ({ ...prev, [slug]: Math.max(1, Number(prev[slug] || 1)) + inc }))
      }
    } catch (err) {
      setStatus('Error al preparar fotos: ' + (err.response?.data?.error || err.message))
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
    setSaveError(false)
    setStatus('Guardando...')
    setSaveModalOpen(true)
    setLoading(true)
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

      if (pendingFiles.length) {
        const fd = new FormData()
        const entryChild = entry && (entry.numeroDo || '') && String(entry.numeroDo) === String(id) ? entry : null
        const entryMaster = entry && (entry.numeroMaster || '') && String(entry.numeroMaster) === String(id) ? entry : null
        const isMasterLocal = !!entryMaster && !entryChild
        const masterId = isMasterLocal ? String(id) : String((entry && (entry.numeroMaster || entry.numeroDo)) || id)
        fd.append('master_id', masterId)
        if (!isMasterLocal) {
          const childId = String((entry && (entry.numeroHBL || entry.hbl)) || '')
          fd.append('child_id', childId)
        } else {
          fd.append('numero_DO_master', String(entry?.numeroDo || ''))
        }
        if (isMaster && selectedPrefix) fd.append('prefix', selectedPrefix)
        if (entry) {
          fd.append('cliente_nombre', String(entry.nombreCliente || entry.clienteNombre || entry.razonSocial || entry.nombre || ''))
          fd.append('cliente_nit', String(entry.nitCliente || entry.clienteNit || entry.nit || ''))
          fd.append('numero_ie', String(entry.numeroIE || entry.ie || entry.ieNumber || ''))
          fd.append('descripcion_mercancia', String(entry.descripcionMercancia || entry.descripcion || ''))
          fd.append('numero_pedido', String(entry.numeroPedido || entry.pedido || entry.orderNumber || ''))
        }
        pendingFiles.forEach(f => fd.append('photos', f))
        const upRes = await API.post('/bls/' + id + '/photos', fd)
        const newPhotos = (upRes.data.photos || []).map(p => ({ ...p, url: p.id ? ('/uploads/' + p.id) : p.url }))
        setPhotos(prev => prev.filter(p => !String(p.id||'').endsWith('-local')).concat(newPhotos))
        setPendingFiles([])
      }

      let payload = {}
      if (entry) {
        const isMasterLocal = String(entry.numeroMaster || '') === String(id) && String(entry.numeroDo || '') !== String(id)
        if (isMasterLocal) {
          payload = { numero_DO_master: String(entry.numeroDo || '') }
        } else {
          const masterDo = (() => {
            try {
              const cache = JSON.parse(localStorage.getItem('tbMastersCache') || '{}')
              const arr = Array.isArray(cache.data) ? cache.data : []
              const m = arr.find(m => String(m.numeroMaster || '') === String(entry.numeroMaster || ''))
              return String(m?.numeroDo || m?.numeroDO || '')
            } catch { return '' }
          })()
          payload = {
            child_id: String(entry.numeroHBL || entry.hbl || ''),
            cliente_nombre: String(entry.cliente || entry.nombreCliente || entry.clienteNombre || entry.razonSocial || entry.nombre || ''),
            numero_ie: String(entry.numeroIE || entry.ie || entry.ieNumber || ''),
            numero_DO_master: masterDo,
            numero_DO_hijo: String(entry.numeroDo || ''),
            pais_de_origen: String(entry.paisOrigen || ''),
            puerto_de_origen: String(entry.puertoOrigen || '')
          }
        }
      }

      await API.post('/bls/' + id + '/send', payload)
      setStatus('Guardado correctamente')
    } catch (err) {
      setStatus('Error al guardar: ' + (err.response?.data?.error || err.message))
      setSaveError(true)
    } finally {
      setLoading(false)
    }
  }

  function openFileDialog(){ if (isMaster && !selectedPrefix) { setStatus('Selecciona un prefijo para nombrar las fotos'); setPrefixError(true); setPrefixModalOpen(true); return } fileInputRef.current?.click() }
  function onDrop(e){ e.preventDefault(); if (isMaster && !selectedPrefix) { setStatus('Selecciona un prefijo para nombrar las fotos'); setPrefixError(true); setPrefixModalOpen(true); return } const files = Array.from(e.dataTransfer?.files || []); if (!files.length) return; const synthetic = { target: { files } }; onUpload(synthetic) }
  function onDragOver(e){ e.preventDefault() }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="h1">Evidencia Fotográfica</h1>
          <p className="muted">{isMaster ? 'MASTER ' : 'HBL '}{id}</p>
        </div>
        <div className="actions-row">
          <button className="btn btn-outline" onClick={() => navigate(-1)}>← Volver</button>
        </div>
      </div>

      <div className="card">
        {isMaster && (
          <div className="grid-2">
            <label className="label">Prefijo para nombrar
              <select className="input" value={selectedPrefix} onChange={(e) => { const v = e.target.value; setSelectedPrefix(v); if (v) { setPrefixError(false); setPrefixModalOpen(false) } }}>
                <option value="">Selecciona prefijo</option>
                {PREFIXES.map(o => <option key={o.slug} value={o.slug}>{o.label}</option>)}
              </select>
            </label>
          </div>
        )}
        {!isMaster && (
          <div className="grid-2">
            <label className="label" style={{ display:'flex', alignItems:'center', gap:8 }}>
              <input type="checkbox" checked={childUseAveria} onChange={(e) => setChildUseAveria(e.target.checked)} />
              Nombrar HBL como 'avería_xx'
            </label>
          </div>
        )}
        
        <div style={{ marginTop:'12px' }}>
          <h2 className="h2">Evidencia</h2>
          <div className="dropzone" onClick={openFileDialog} onDrop={onDrop} onDragOver={onDragOver}>Arrastra y suelta archivos aquí<br/>o haz clic para buscar</div>
          <div className="actions" style={{ justifyContent:'flex-start' }}>
            <button className="btn btn-primary" onClick={openFileDialog}>Subir Archivo</button>
            <button className="btn btn-outline" onClick={openFileDialog}>Tomar Foto</button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" style={{ display:'none' }} onChange={onUpload} disabled={loading} />
        </div>

        {status && <p className="muted" style={prefixError ? { color: '#e11' } : undefined}>{status}</p>}

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

      {prefixModalOpen && (
        <div className="modal-backdrop" onClick={() => setPrefixModalOpen(false)}>
          <div className="modal" style={{ width: '420px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Prefijo requerido</span>
              <button type="button" className="btn btn-outline btn-small" style={{ fontSize: '1.5rem' }} onClick={() => setPrefixModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div>Selecciona un prefijo para nombrar las fotos antes de continuar.</div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setPrefixModalOpen(false)}>Entendido</button>
            </div>
          </div>
        </div>
      )}

      {saveModalOpen && (
        <div className="modal-backdrop" onClick={() => setSaveModalOpen(false)}>
          <div className="modal" style={{ width: '420px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{saveError ? 'Error' : 'Resultado de guardado'}</span>
              <button type="button" className="btn btn-outline btn-small" style={{ fontSize: '1.5rem' }} onClick={() => setSaveModalOpen(false)}>×</button>
            </div>
            <div className="modal-body" style={{ textAlign:'center' }}>
              {!saveError && !loading ? <div style={{ fontSize: '48px', color: '#19a45b' }}>✔</div> : null}
              <div className={saveError ? 'muted' : ''} style={saveError ? { color: '#e11' } : { marginTop: 8 }}>{status}</div>
              {loading ? <div className="muted" style={{ marginTop: 8 }}>Procesando...</div> : null}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setSaveModalOpen(false)} disabled={loading}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {loading && !saveModalOpen && (
        <div className="modal-backdrop" onClick={(e) => e.stopPropagation()}>
          <div className="modal" style={{ width: '280px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-body" style={{ textAlign:'center' }}>
              <div className="muted">Procesando...</div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default BLEvidence