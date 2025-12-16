import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import API, { EVIDENCE_ENDPOINT } from '../lib/api.js'

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const res = String(reader.result || '')
      const idx = res.indexOf(',')
      resolve(idx >= 0 ? res.slice(idx + 1) : res)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function extFor(p, mime) {
  const name = String(p.filename || '')
  const dot = name.lastIndexOf('.')
  const e = dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
  if (e) return '.' + e
  if (mime === 'image/jpeg') return '.jpg'
  if (mime === 'image/png') return '.png'
  if (mime === 'application/pdf') return '.pdf'
  return '.dat'
}

function parsePrefix(filename) {
  const s = String(filename || '')
  const dot = s.lastIndexOf('.')
  const base = dot >= 0 ? s.slice(0, dot) : s
  const parts = base.split('_')
  if (parts.length < 2) return null
  const numStr = parts[parts.length - 1]
  const num = Number(numStr)
  if (!Number.isFinite(num)) return null
  const prefix = parts[0]
  const container = parts.length >= 3 ? parts.slice(1, parts.length - 1).join('_') : ''
  const ext = dot >= 0 ? s.slice(dot) : ''
  return { prefix, container, num, ext }
}

function normalizeList(items) {
  const arr = Array.isArray(items) ? items.slice() : []
  const groups = {}
  arr.forEach(p => {
    const r = parsePrefix(p?.filename || '')
    if (r && r.prefix) {
      const key = r.prefix
      if (!groups[key]) groups[key] = []
      groups[key].push({ p, r })
    }
  })
  Object.keys(groups).forEach(k => {
    const g = groups[k]
    g.sort((a,b) => {
      const ta = Number((String(a.p.id||'').split('-')[0]) || 0)
      const tb = Number((String(b.p.id||'').split('-')[0]) || 0)
      if (ta !== tb) return ta - tb
      return a.r.num - b.r.num
    })
    g.forEach((t,i) => { t.p.filename = `${k}_${i + 1}${t.r.ext}` })
  })
  return arr
}

function BLEvidenceMaster() {
  const { masterId, id } = useParams()
  const navigate = useNavigate()
  const targetId = masterId || id
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const fileInputRef = useRef()
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [confirmPhoto, setConfirmPhoto] = useState(null)
  const [cacheEntry, setCacheEntry] = useState(null)
  const [selectedPrefix, setSelectedPrefix] = useState('')
  const [selectedContainer, setSelectedContainer] = useState('')
  const [counters, setCounters] = useState({})
  const [prefixModalOpen, setPrefixModalOpen] = useState(false)
  const [prefixError, setPrefixError] = useState(false)
  const [containerModalOpen, setContainerModalOpen] = useState(false)
  const [containerError, setContainerError] = useState(false)
  const containers = useMemo(() => {
    const raw = cacheEntry?.contenedores
    const arr = Array.isArray(raw) ? raw : []
    return arr.map((c) => {
      if (typeof c === 'string') return { label: c, value: c }
      const v = String(c?.numeroContenedor || c?.numero_contenedor || c?.numero || c?.container || c?.id || c?.code || c?.name || '').trim()
      const label = String(c?.label || c?.nombre || c?.name || v || '').trim()
      return { label: label || v, value: v || label }
    }).filter(x => x && x.value)
  }, [cacheEntry])
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  useEffect(() => { const onResize = () => setIsMobile(window.innerWidth <= 768); window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize) }, [])
  const isAdmin = (() => { try { const u = JSON.parse(localStorage.getItem('user') || '{}'); return String(u.role || '') === 'admin' } catch { return false } })()

  const PREFIXES = [
    { label: 'Contenedor cerrado', slug: 'contenedor_cerrado' },
    { label: 'Contenedor abierto', slug: 'contenedor_abierto' },
    { label: 'No. de contenedor', slug: 'no_de_contenedor' },
    { label: 'Sello', slug: 'sello' },
    { label: 'Líneas de cargue', slug: 'lineas_de_cargue' },
    { label: 'Averia', slug: 'averia' },
    { label: 'SGA', slug: 'sga' },
    { label: 'Contenedor vacío ( lado izquierdo, lado derecho, piso, techo.)', slug: 'contenedor_vacio' },
    { label: 'Tarja', slug: 'tarja' },
    { label: 'Acta de averia', slug: 'acta_de_averia' },
  ]

  const details = useMemo(() => {
    try {
      const cache = JSON.parse(localStorage.getItem('tbMastersCache') || '{}')
      const arr = Array.isArray(cache.data) ? cache.data : []
      const masterIdLocal = String(masterId || targetId || '')
      const m = arr.find(x => String(x.numeroMaster || '') === masterIdLocal)
      const masterDo = String(m?.numeroDo || m?.numeroDO || '')
      return { isChild: false, master_id: masterIdLocal, child_id: '', numero_DO_master: masterDo }
    } catch {
      return { isChild: false, master_id: String(masterId || targetId || ''), child_id: '', numero_DO_master: '' }
    }
  }, [masterId, targetId])

  useEffect(() => {
    let mounted = true
    const tid = String(targetId || '')
    if (!tid) return () => { mounted = false }
    setLoading(true)
    API.get('/bls/' + tid + '/photos').then(async (res) => {
      if (!mounted) return
      let list = Array.isArray(res.data?.photos) ? res.data.photos : []
      setPhotos(list)
    }).catch(() => setPhotos([])).finally(() => setLoading(false))
    try {
      const cache = JSON.parse(localStorage.getItem('tbMastersCache') || '{}')
      const arr = Array.isArray(cache.data) ? cache.data : []
      const entryMaster = arr.find(x => (x.numeroMaster || '') && String(x.numeroMaster) === String(tid))
      if (entryMaster) setCacheEntry(entryMaster)
    } catch {}
    return () => { mounted = false }
  }, [targetId])

  const orderedPhotos = useMemo(() => {
    const parseTs = (p) => {
      const raw = String(p.id || '')
      const n = Number((raw.split('-')[0]) || 0)
      return Number.isFinite(n) ? n : 0
    }
    return (photos || [])
      .filter(p => p && p.id && p.url)
      .slice()
      .sort((a, b) => parseTs(a) - parseTs(b))
  }, [photos])

  useEffect(() => {
    const next = {}
    const list = Array.isArray(photos) ? photos : []
    list.forEach(p => {
      const r = parsePrefix(p?.filename || '')
      if (r && r.prefix) {
        const key = r.prefix + '__' + (r.container || '')
        if (Number.isFinite(r.num)) next[key] = Math.max(next[key] || 1, r.num + 1)
      }
    })
    setCounters(next)
  }, [photos])

  useEffect(() => {
  }, [photos])

  async function onUpload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length || !targetId) return
    if (containers.length && !selectedContainer) { setStatus('Selecciona un contenedor'); setContainerError(true); setContainerModalOpen(true); return }
    if (!selectedPrefix) { setStatus('Selecciona un prefijo para nombrar las fotos'); setPrefixError(true); setPrefixModalOpen(true); return }
    const maxSize = 5 * 1024 * 1024
    const valid = files.filter(f => Number(f.size || 0) <= maxSize)
    const skipped = files.length - valid.length
    if (skipped > 0) setStatus('Se omitieron ' + skipped + ' archivo(s) por superar 5MB')
    if (!valid.length) return
    setUploading(true)
    setLoading(true)
    let filesToUse = valid
    try {
      const slug = selectedPrefix
      const used = []
      ;(Array.isArray(photos) ? photos : []).forEach(p => { const r = parsePrefix(p?.filename || ''); if (r && r.prefix === slug && r.container === (selectedContainer || '')) used.push(r.num) })
      ;(Array.isArray(pendingFiles) ? pendingFiles : []).forEach(f => { const r = parsePrefix(String(f.name || '')); if (r && r.prefix === slug && r.container === (selectedContainer || '')) used.push(r.num) })
      const start = used.length ? Math.max(...used) + 1 : 1
      filesToUse = valid.map((f, i) => {
        const original = String(f.name || '')
        const dot = original.lastIndexOf('.')
        const ext = dot >= 0 ? original.slice(dot) : ''
        const cont = selectedContainer ? `${selectedContainer}_` : ''
        const newName = `${slug}_${cont}${start + i}${ext}`
        return new File([f], newName, { type: f.type })
      })
      const now = Date.now()
      const staged = filesToUse.map((f, i) => ({ id: `${now + i}-local`, filename: f.name, url: URL.createObjectURL(f) }))
      setPendingFiles(prev => prev.concat(filesToUse))
      setPhotos(prev => prev.concat(staged))
      setStatus('Fotos preparadas: ' + staged.length)
      const inc = filesToUse.length
      const key = slug + '__' + (selectedContainer || '')
      setCounters(prev => ({ ...prev, [key]: start + inc }))
    } catch (err) {
      setStatus('Error al preparar fotos: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
      setUploading(false)
    }
  }

  async function onDeleteConfirmed() {
    const ph = confirmPhoto
    const photoId = ph?.id
    const victim = parsePrefix(ph?.filename || '')
    if (!photoId) { setConfirmPhoto(null); return }
    if (String(photoId).endsWith('-local')) {
      try {
        setPhotos(prev => prev.filter(p => p.id !== photoId))
        setPendingFiles(prev => {
          const next = prev.slice()
          const idx = next.findIndex(f => String(f.name || '') === String(ph?.filename || ''))
          if (idx >= 0) next.splice(idx, 1)
          return next
        })
        try { if (ph?.url) URL.revokeObjectURL(ph.url) } catch {}
        setStatus('Vista previa eliminada')
      } catch (err) {
        setStatus('Error al eliminar: ' + (err.response?.data?.error || err.message))
      } finally {
        setConfirmPhoto(null)
      }
      return
    }
    setLoading(true)
    try {
      let res
      try {
        res = await API.delete('/photos/' + photoId)
      } catch (errDel) {
        const status = errDel?.response?.status
        const ct = String(errDel?.response?.headers?.['content-type'] || '')
        if (String(status) === '405' || /text\/html/i.test(ct)) {
          res = await API.post('/photos/' + photoId + '/delete')
        } else {
          throw errDel
        }
      }
      if (res.data?.deleted) {
        const tid = String(targetId || '')
        if (tid) {
          try {
            const ref = await API.get('/bls/' + tid + '/photos')
            let list = Array.isArray(ref.data?.photos) ? ref.data.photos : []
            setPhotos(list)
            const deletedName = String(ph?.filename || '')
            const deletedExt = extFor({ filename: deletedName }, '')
            const dotDel = deletedName.lastIndexOf('.')
            const baseNameDel = dotDel >= 0 ? deletedName.slice(0, dotDel) : deletedName
            const docDel = { name: baseNameDel, extension: deletedExt, category: 'delete', date: dayjs().format('DD/MM/YYYY'), contentBase64: '' }
            const payloadDel = {
              referenceNumber: String(details.master_id || ''),
              doNumber: String(details.numero_DO_master || ''),
              type: 'master',
              documents: [docDel]
            }
            await API.post(EVIDENCE_ENDPOINT, payloadDel)
          } catch {
            setStatus('Foto eliminada')
          }
        } else {
          setStatus('Foto eliminada')
        }
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
    if (!targetId) return
    setSaveError(false)
    setStatus('Guardando...')
    setSaveModalOpen(true)
    setLoading(true)
    try {
      if (pendingFiles.length) {
        setUploading(true)
        setUploadProgress(0)
        const total = pendingFiles.length
        let uploaded = 0
        let newPhotos = []
        for (const f of pendingFiles) {
          const fd = new FormData()
          const masterIdVal = String(masterId || targetId || '')
          fd.append('master_id', masterIdVal)
          fd.append('numero_DO_master', String(details.numero_DO_master || ''))
          if (selectedPrefix) fd.append('prefix', selectedPrefix)
          if (selectedContainer) fd.append('contenedor', selectedContainer)
          if (cacheEntry) {
            fd.append('cliente_nit', String(cacheEntry.nitCliente || cacheEntry.clienteNit || cacheEntry.nit || ''))
            fd.append('descripcion_mercancia', String(cacheEntry.descripcionMercancia || cacheEntry.descripcion || ''))
            fd.append('numero_pedido', String(cacheEntry.numeroPedido || cacheEntry.pedido || cacheEntry.orderNumber || ''))
          }
          fd.append('photos', f)
          const upRes = await API.post('/bls/' + (targetId) + '/photos', fd)
          const batch = (upRes.data.photos || []).map(p => ({ ...p, url: p.id ? ('/uploads/' + p.id) : p.url }))
          newPhotos = newPhotos.concat(batch)
          uploaded += 1
          setUploadProgress(Math.round((uploaded / total) * 100))
          setStatus('Guardando imagen ' + uploaded + ' de ' + total)
        }
        const docs = await Promise.all((pendingFiles || []).map(async (f) => {
          const name = String(f.name || '')
          const dot = name.lastIndexOf('.')
          const baseName = dot >= 0 ? name.slice(0, dot) : name
          const ext = extFor({ filename: name }, f.type)
          const date = dayjs().format('DD/MM/YYYY')
          const r = parsePrefix(name)
          const category = (r?.prefix === 'averia') ? 'averia' : ''
          const contentBase64 = await blobToBase64(f)
          return { name: baseName, extension: ext, category, date, contentBase64 }
        }))
        setPhotos(newPhotos)
        setUploading(false)
        const payload = {
          referenceNumber: String(details.master_id || ''),
          doNumber: String(details.numero_DO_master || ''),
          type: 'master',
          documents: docs
        }
        const resEv = await API.post(EVIDENCE_ENDPOINT, payload)
        const ok = resEv && resEv.status >= 200 && resEv.status < 300 && (resEv.data?.success !== false)
        if (!ok) throw new Error('Error en envío de evidencias')
        setPendingFiles([])
        setStatus('Guardado correctamente')
      }
      if (!pendingFiles.length) setStatus('No hay cambios para guardar')
    } catch (err) {
      setStatus('Error al guardar: ' + (err.response?.data?.error || err.message))
      setSaveError(true)
    } finally {
      setLoading(false)
      setUploading(false)
    }
  }

  function openFileDialog(){ if (uploading || isAdmin) { return } if (containers.length && !selectedContainer) { setStatus('Selecciona un contenedor'); setContainerError(true); setContainerModalOpen(true); return } if (!selectedPrefix) { setStatus('Selecciona un prefijo para nombrar las fotos'); setPrefixError(true); setPrefixModalOpen(true); return } fileInputRef.current?.click() }
  function onDrop(e){ e.preventDefault(); if (uploading || isAdmin) { return } if (containers.length && !selectedContainer) { setStatus('Selecciona un contenedor'); setContainerError(true); setContainerModalOpen(true); return } if (!selectedPrefix) { setStatus('Selecciona un prefijo para nombrar las fotos'); setPrefixError(true); setPrefixModalOpen(true); return } const files = Array.from(e.dataTransfer?.files || []); if (!files.length) return; const synthetic = { target: { files } }; onUpload(synthetic) }
  function onDragOver(e){ e.preventDefault() }

  function urlFor(u) { const s = String(u || ''); if (!s) return ''; if (/^(?:https?:\/\/|blob:|data:)/.test(s)) return s; const base = API.defaults?.baseURL || ''; return base ? (base + (s.startsWith('/') ? s : ('/' + s))) : s }
  function onDownloadPhoto(photo){ if (!photo || !photo.url) return; const a = document.createElement('a'); a.href = urlFor(photo.url); a.download = String(photo.filename || photo.id || 'foto'); a.target = '_blank'; document.body.appendChild(a); a.click(); document.body.removeChild(a) }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="h1">Evidencia Fotográfica</h1>
          <p className="muted">MASTER {masterId || targetId}</p>
        </div>
        <div className="actions-row">
          <button className="btn btn-outline" onClick={() => navigate(-1)}>← Volver</button>
        </div>
      </div>

      <div className="card">
        <div className="grid-2">
          {!isAdmin && containers.length > 0 ? (
            <label className="label">Contenedor
              <select className="input" value={selectedContainer} onChange={(e) => { const v = e.target.value; setSelectedContainer(v); if (v) { setContainerError(false); setContainerModalOpen(false) } }}>
                <option value="">Selecciona contenedor</option>
                {containers.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
          ) : null}
          {!isAdmin && (
            <label className="label">Prefijo para nombrar
              <select className="input" value={selectedPrefix} onChange={(e) => { const v = e.target.value; setSelectedPrefix(v); if (v) { setPrefixError(false); setPrefixModalOpen(false) } }}>
                <option value="">Selecciona prefijo</option>
                {PREFIXES.map(o => <option key={o.slug} value={o.slug}>{o.label}</option>)}
              </select>
            </label>
          )}
        </div>

        <div style={{ marginTop:'12px' }}>
          <h2 className="h2" style={{ display:'flex', alignItems:'center', gap:8 }}>Evidencia {uploading ? (<svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="#c0c4c9" strokeWidth="3" fill="none" opacity="0.25"/><path d="M12 2a10 10 0 0 1 0 20" stroke="var(--brand)" strokeWidth="3" fill="none"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>) : null}</h2>
          {!isAdmin && (
            <div className="dropzone" onClick={isAdmin ? undefined : openFileDialog} onDrop={onDrop} onDragOver={onDragOver}>
              {uploading ? (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, flexDirection:'column' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <svg width="24" height="24" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" stroke="#c0c4c9" strokeWidth="4" fill="none" opacity="0.25"/>
                      <path d="M12 2a10 10 0 0 1 0 20" stroke="var(--brand)" strokeWidth="4" fill="none">
                        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                      </path>
                    </svg>
                    <span>Cargando imágenes...</span>
                  </div>
                  <div>Por favor espera</div>
                </div>
              ) : (
                <>
                  Arrastra y suelta archivos aquí<br/>
                  o haz clic para buscar
                </>
              )}
            </div>
          )}
          <div className="actions" style={{ justifyContent:'flex-start' }}>
            {!isAdmin && (
              <>
                <button className="btn btn-primary" onClick={openFileDialog} disabled={uploading || loading}>Tomar Foto</button>
                <button className="btn btn-outline" onClick={openFileDialog} disabled={uploading || loading}>Subir Archivo</button>
              </>
            )}
          </div>
          {!isAdmin && (<input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" style={{ display:'none' }} onChange={onUpload} disabled={loading || uploading} />)}
        </div>

        {status && <p className="muted" style={(prefixError || containerError) ? { color: '#e11' } : undefined}>{status}</p>}

        {orderedPhotos.length === 0 ? (
          <p className="muted">Aún no hay fotos para este MASTER.</p>
        ) : (
          isMobile ? (
            <div className="preview-grid">
              {orderedPhotos.map(p => {
                const ts = Number((String(p.id||'').split('-')[0]) || 0)
                const fecha = ts ? dayjs(ts).format('YYYY-MM-DD HH:mm') : '-'
                const usuario = p.user_nombre || p.user_display_name || p.user_email || '-'
                return (
                  <div key={p.id} className="preview-card">
                    {p.url ? (
                      <img src={urlFor(p.url)} alt={p.filename || p.id} onClick={() => setSelectedPhoto(p)} />
                    ) : (
                      <div className="muted" style={{ padding: 12 }}>(sin vista previa)</div>
                    )}
                    <div style={{ padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div className="muted" style={{ fontSize: 12 }}>{fecha} • {usuario}</div>
                      <div>
                        <button className="btn btn-outline btn-small" onClick={() => setSelectedPhoto(p)}>Ver</button>
                        {' '}
                        <button className="btn btn-outline btn-small" onClick={() => onDownloadPhoto(p)} disabled={!p.url}>Descargar</button>
                        {' '}
                        {!isAdmin && <button className="btn btn-danger btn-small" onClick={() => setConfirmPhoto(p)} disabled={loading}>Eliminar</button>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
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
                    const usuario = p.user_nombre || p.user_display_name || p.user_email || '-'
                    return (
                      <tr key={p.id}>
                        <td>
                          {p.url ? (
                            <img src={urlFor(p.url)} alt={p.filename || p.id} style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6, cursor: 'zoom-in' }} onClick={() => setSelectedPhoto(p)} />
                          ) : (
                            <span className="muted">(sin vista previa)</span>
                          )}
                        </td>
                        <td>{fecha}</td>
                        <td>{usuario}</td>
                        <td>{p.filename || p.id}</td>
                        <td className="table-actions">
                          <button className="btn btn-outline btn-small" onClick={() => setSelectedPhoto(p)}>Ver foto</button>
                          <button className="btn btn-outline btn-small" onClick={() => onDownloadPhoto(p)} disabled={!p.url}>Descargar</button>
                          {!isAdmin && <button className="btn btn-danger btn-small" onClick={() => setConfirmPhoto(p)} disabled={loading}>Eliminar</button>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        <div className="actions" style={{ justifyContent:'flex-end' }}>
          {!isAdmin && <button className="btn btn-outline" onClick={onSave} disabled={loading}>Guardar</button>}
        </div>

        {isMobile && !isAdmin && (pendingFiles.length > 0 || uploading) && (
          <>
            <div className="bottom-spacer" />
            <div className="bottom-bar">
              <button className="btn btn-outline" onClick={openFileDialog} disabled={uploading || loading}>Subir</button>
              <button className="btn btn-primary" onClick={onSave} disabled={loading}>Guardar</button>
            </div>
          </>
        )}
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
                <img src={urlFor(selectedPhoto.url)} alt={selectedPhoto.filename || selectedPhoto.id} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
              ) : (
                <div className="muted">No disponible</div>
              )}
            </div>
            <div className="modal-footer">
              {selectedPhoto?.url ? <button className="btn btn-outline" onClick={() => onDownloadPhoto(selectedPhoto)}>Descargar</button> : null}
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
                {confirmPhoto?.url ? <img src={urlFor(confirmPhoto.url)} alt={confirmPhoto.filename || confirmPhoto.id} style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6 }} /> : null}
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

      {containerModalOpen && (
        <div className="modal-backdrop" onClick={() => setContainerModalOpen(false)}>
          <div className="modal" style={{ width: '420px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Contenedor requerido</span>
              <button type="button" className="btn btn-outline btn-small" style={{ fontSize: '1.5rem' }} onClick={() => setContainerModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <div>Selecciona un contenedor antes de continuar.</div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setContainerModalOpen(false)}>Entendido</button>
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
              {uploading ? (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, flexDirection:'column' }}>
                  <div style={{ width:'100%', maxWidth:320, height:12, background:'#e5e7eb', borderRadius:6, overflow:'hidden' }}>
                    <div style={{ width: uploadProgress + '%', height:'100%', background:'var(--brand)', transition:'width .2s' }} />
                  </div>
                  <div className="muted">{uploadProgress}%</div>
                </div>
              ) : (!saveError && !loading ? <div style={{ fontSize: '48px', color: '#19a45b' }}>✔</div> : null)}
              <div className={saveError ? 'muted' : ''} style={saveError ? { color: '#e11' } : { marginTop: 8 }}>{status}</div>
              {loading && !uploading ? <div className="muted" style={{ marginTop: 8 }}>Procesando...</div> : null}
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setSaveModalOpen(false)} disabled={loading}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {loading && !saveModalOpen && (
        <div className="loading-backdrop" aria-live="polite" aria-busy="true">
          <div className="loading-spinner"></div>
          <div className="loading-text">Cargando...</div>
        </div>
      )}
    </>
  )
}

export default BLEvidenceMaster
