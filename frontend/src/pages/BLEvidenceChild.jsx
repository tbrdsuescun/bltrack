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
  const idx = base.lastIndexOf('_')
  if (idx <= 0) return null
  const prefix = base.slice(0, idx)
  const numStr = base.slice(idx + 1)
  const num = Number(numStr)
  if (!Number.isFinite(num)) return null
  const ext = dot >= 0 ? s.slice(dot) : ''
  return { prefix, num, ext }
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

function urlFor(u) { const s = String(u || ''); if (!s) return ''; if (/^(?:https?:\/\/|blob:|data:)/.test(s)) return s; const base = API.defaults?.baseURL || ''; return base ? (base + (s.startsWith('/') ? s : ('/' + s))) : s }

function BLEvidenceChild() {
  const { masterId, hblId, id } = useParams()
  const navigate = useNavigate()
  const targetId = hblId || id || masterId
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const fileInputRef = useRef()
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [confirmPhoto, setConfirmPhoto] = useState(null)
  const [cacheEntry, setCacheEntry] = useState(null)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [hasNewUploads, setHasNewUploads] = useState(false)
  const [recentPhotoIds, setRecentPhotoIds] = useState([])
  const [recentDocuments, setRecentDocuments] = useState([])
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  useEffect(() => { const onResize = () => setIsMobile(window.innerWidth <= 768); window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize) }, [])
  const isAdmin = (() => { try { const u = JSON.parse(localStorage.getItem('user') || '{}'); return String(u.role || '') === 'admin' } catch { return false } })()

  function Toggle({ checked, onChange }) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{ position:'relative', width:44, height:24, borderRadius:12, background: checked ? 'var(--accent)' : '#e5e7eb', border:'1px solid #d1d5db', display:'inline-flex', alignItems:'center', padding:2, transition:'background .2s' }}
      >
        <span style={{ width:20, height:20, borderRadius:10, background:'#fff', boxShadow:'0 2px 4px rgba(0,0,0,0.15)', transform: checked ? 'translateX(20px)' : 'translateX(0)', transition: 'transform .2s' }} />
      </button>
    )
  }

  const numeroHblCurrent = useMemo(() => {
    const directParam = String(hblId || '').trim()
    if (directParam) return directParam
    const directCache = String(cacheEntry?.numeroHBL || cacheEntry?.hbl || '').trim()
    if (directCache) return directCache
    try {
      const cache = JSON.parse(localStorage.getItem('tbMastersCache') || '{}')
      const arr = Array.isArray(cache.data) ? cache.data : []
      const masterCode = String(masterId || cacheEntry?.numeroMaster || '')
      const masterObj = arr.find(m => String(m.numeroMaster || '') === masterCode && Array.isArray(m.hijos))
      const childObj = masterObj?.hijos?.find(h => String(h?.numeroHBL || h?.hbl || '') === String(hblId || '')) || masterObj?.hijos?.find(h => String(h?.numeroDo || '') === String(targetId || ''))
      const v = String(childObj?.numeroHBL || childObj?.hbl || '').trim()
      return v
    } catch { return '' }
  }, [cacheEntry, masterId, hblId, targetId])

  const details = useMemo(() => {
    try {
      const cache = JSON.parse(localStorage.getItem('tbMastersCache') || '{}')
      const arr = Array.isArray(cache.data) ? cache.data : []
      const masterRow = arr.find(m => String(m.numeroMaster || '') === String(masterId || ''))
      const childRow = masterRow?.hijos?.find(h => String(h.numeroHBL || h.hbl || '') === String(hblId || '')) || arr.find(x => String(x.numeroHBL || x.hbl || '') === String(hblId || ''))
      const masterDo = String(masterRow?.numeroDo || masterRow?.numeroDO || '')
      return {
        isChild: true,
        master_id: String(masterId || masterRow?.numeroMaster || ''),
        child_id: String(hblId || childRow?.numeroHBL || childRow?.hbl || ''),
        cliente_nombre: String(childRow?.cliente || childRow?.nombreCliente || childRow?.clienteNombre || childRow?.razonSocial || childRow?.nombre || ''),
        numero_ie: String(childRow?.numeroIE || childRow?.ie || childRow?.ieNumber || ''),
        numero_DO_master: masterDo,
        numero_DO_hijo: String(childRow?.numeroDo || ''),
        pais_de_origen: String(childRow?.paisOrigen || ''),
        puerto_de_origen: String(childRow?.puertoOrigen || '')
      }
    } catch {
      return { isChild: true, master_id: String(masterId || ''), child_id: String(hblId || ''), numero_DO_master: '', numero_DO_hijo: '' }
    }
  }, [masterId, hblId])

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
      const masterRow = arr.find(x => String(x.numeroMaster || '') === String(masterId || ''))
      const childRow = masterRow?.hijos?.find(h => String(h.numeroHBL || h.hbl || '') === String(hblId || '')) || arr.find(x => String(x.numeroHBL || x.hbl || '') === String(hblId || ''))
      const entry = childRow || masterRow || null
      if (entry) setCacheEntry(entry)
    } catch {}
    return () => { mounted = false }
  }, [targetId, masterId, hblId])

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

  async function onUpload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length || !targetId) return
    setUploading(true)
    setLoading(true)
    let filesToUse = files
    try {
      const slug = String(numeroHblCurrent || details.child_id || '')
      const used = []
      ;(Array.isArray(photos) ? photos : []).forEach(p => { const r = parsePrefix(p?.filename || ''); if (r && r.prefix === slug) used.push(r.num) })
      const start = used.length ? Math.max(...used) + 1 : 1
      filesToUse = files.map((f, i) => {
        const original = String(f.name || '')
        const dot = original.lastIndexOf('.')
        const ext = dot >= 0 ? original.slice(dot) : ''
        const newName = `${slug}_${start + i}${ext}`
        return new File([f], newName, { type: f.type })
      })
      setUploadProgress(0)
      const total = filesToUse.length
      let uploaded = 0
      let newPhotos = []
      for (const f of filesToUse) {
        const fd = new FormData()
        const masterIdVal = String(details.master_id || '')
        fd.append('master_id', masterIdVal)
        fd.append('child_id', String(details.child_id || ''))
        fd.append('numero_DO_master', String(details.numero_DO_master || ''))
        fd.append('numero_DO_hijo', String(details.numero_DO_hijo || ''))
        fd.append('cliente_nombre', String(details.cliente_nombre || ''))
        fd.append('numero_ie', String(details.numero_ie || ''))
        fd.append('pais_de_origen', String(details.pais_de_origen || ''))
        fd.append('puerto_de_origen', String(details.puerto_de_origen || ''))
        if (cacheEntry) {
          fd.append('cliente_nit', String(cacheEntry.nitCliente || cacheEntry.clienteNit || cacheEntry.nit || ''))
          fd.append('descripcion_mercancia', String(cacheEntry.descripcionMercancia || cacheEntry.descripcion || ''))
          fd.append('numero_pedido', String(cacheEntry.numeroPedido || cacheEntry.pedido || cacheEntry.orderNumber || ''))
        }
        const flags = { [f.name]: false }
        fd.append('averia_flags', JSON.stringify(flags))
        fd.append('photos', f)
        const upRes = await API.post('/bls/' + (hblId || targetId) + '/photos', fd)
        const batch = (upRes.data.photos || []).map(p => ({ ...p, url: p.id ? ('/uploads/' + p.id) : p.url }))
        newPhotos = newPhotos.concat(batch)
        uploaded += 1
        setUploadProgress(Math.round((uploaded / total) * 100))
        setStatus('Guardando imagen ' + uploaded + ' de ' + total)
      }

      try {
        const tid = String(hblId || targetId || '')
        if (tid) {
          const ref = await API.get('/bls/' + tid + '/photos')
          let list = Array.isArray(ref.data?.photos) ? ref.data.photos : newPhotos
          setPhotos(list)
        } else {
          const acc = []
          const seen = new Set()
          ;(Array.isArray(photos) ? photos : []).concat(newPhotos).forEach(p => {
            const key = String(p.id || p.filename || '')
            if (!seen.has(key)) { seen.add(key); acc.push(p) }
          })
          setPhotos(acc)
        }
      } catch {
        const acc = []
        const seen = new Set()
        ;(Array.isArray(photos) ? photos : []).concat(newPhotos).forEach(p => {
          const key = String(p.id || p.filename || '')
          if (!seen.has(key)) { seen.add(key); acc.push(p) }
        })
        setPhotos(acc)
      }
      setStatus('Imágenes subidas: ' + (newPhotos.length || filesToUse.length))
      setHasNewUploads(true)
      setRecentPhotoIds(prev => prev.concat((newPhotos || []).map(p => String(p.id)).filter(Boolean)))
      const docs = await Promise.all((filesToUse || []).map(async (f) => {
        const name = String(f.name || '')
        const dot = name.lastIndexOf('.')
        const baseName = dot >= 0 ? name.slice(0, dot) : name
        const ext = extFor({ filename: name }, f.type)
        const date = dayjs().format('DD/MM/YYYY')
        const contentBase64 = await blobToBase64(f)
        return { name: baseName, extension: ext, category: '', date, contentBase64 }
      }))
      setRecentDocuments(prev => prev.concat(docs))
    } catch (err) {
      setStatus('Error al preparar fotos: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
      setUploading(false)
    }
  }

  async function onToggleAveria(photoId, checked) {
    const currentPhoto = (photos || []).find(p => p.id === photoId) || null
    setPhotos(prev => prev.map(p => (p.id === photoId ? { ...p, averia: !!checked } : p)))
    try {
      const tid = String(hblId || targetId || '')
      if (!tid) return
      await API.patch('/bls/' + tid + '/photos/averia', { flags: { [photoId]: !!checked } })
      if (currentPhoto && currentPhoto.url) {
        const res = await fetch(urlFor(currentPhoto.url))
        const blob = await res.blob()
        const contentBase64 = await blobToBase64(blob)
        const name = String(currentPhoto.filename || '')
        const dot = name.lastIndexOf('.')
        const baseName = dot >= 0 ? name.slice(0, dot) : name
        const ext = extFor(currentPhoto, blob.type)
        const category = checked ? 'averia' : ''
        const doc = { name: baseName, extension: ext, category, date: dayjs().format('DD/MM/YYYY'), contentBase64 }
        const payload = { referenceNumber: String(numeroHblCurrent || targetId || ''), doNumber: String(details.numero_DO_hijo || details.numero_DO_master || ''), type: 'hijo', documents: [doc] }
        await API.post(EVIDENCE_ENDPOINT, payload)
      }
      setStatus('Avería actualizada')
    } catch (err) {
      setStatus('Error al actualizar avería: ' + (err.response?.data?.error || err.message))
      setPhotos(prev => prev.map(p => (p.id === photoId ? { ...p, averia: !checked } : p)))
    }
  }

  async function onDeleteConfirmed() {
    const photoId = confirmPhoto?.id
    if (!photoId) { setConfirmPhoto(null); return }
    setLoading(true)
    try {
      const res = await API.delete('/photos/' + photoId)
      if (res.data?.deleted) {
        setPhotos(prev => prev.filter(p => p.id !== photoId))
        const tid = String(hblId || targetId || '')
        if (tid) {
          try {
            const ref = await API.get('/bls/' + tid + '/photos')
            let list = Array.isArray(ref.data?.photos) ? ref.data.photos : []
            setPhotos(list)
          } catch {}
          const deletedName = String(confirmPhoto?.filename || '')
          const dotDel = deletedName.lastIndexOf('.')
          const baseNameDel = dotDel >= 0 ? deletedName.slice(0, dotDel) : deletedName
          const deletedExt = extFor({ filename: deletedName }, '')
          const docDel = { name: baseNameDel, extension: deletedExt, category: 'delete', date: dayjs().format('DD/MM/YYYY'), contentBase64: '' }
          const payloadDel = {
            referenceNumber: String(numeroHblCurrent || targetId || ''),
            doNumber: String(details.numero_DO_hijo || details.numero_DO_master || ''),
            type: 'hijo',
            documents: [docDel]
          }
          await API.post(EVIDENCE_ENDPOINT, payloadDel)
          setRecentPhotoIds(prev => prev.filter(id => id !== String(photoId)))
          setRecentDocuments(prev => prev.filter(d => d.id !== String(photoId)))
        }
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
    if (!targetId) return
    setSaveError(false)
    setStatus('Guardando...')
    setSaveModalOpen(true)
    setLoading(true)
    try {
      const flagsExisting = {}
      ;(photos || []).forEach(p => { if (!String(p.id||'').endsWith('-local')) flagsExisting[p.id] = !!p.averia })
      await API.patch('/bls/' + (hblId || targetId) + '/photos/averia', { flags: flagsExisting })
      if (hasNewUploads && recentPhotoIds.length) {
        const docs = recentDocuments.map(d => {
          const dn = String(d.name || '')
          let cat = String(d.category || '')
          const match = (photos || []).find(p => {
            const fn = String(p.filename || '')
            const dot = fn.lastIndexOf('.')
            const bn = dot >= 0 ? fn.slice(0, dot) : fn
            return bn === dn
          })
          if (match && !!match.averia) cat = 'averia'
          return { ...d, category: cat }
        })
        const payload = {
          referenceNumber: String(numeroHblCurrent || targetId || ''),
          doNumber: String(details.numero_DO_hijo || details.numero_DO_master || ''),
          type: 'hijo',
          documents: docs
        }
        await API.post(EVIDENCE_ENDPOINT, payload)
        setHasNewUploads(false)
        setRecentPhotoIds([])
        setRecentDocuments([])
      }
      setStatus('Guardado correctamente')
    } catch (err) {
      setStatus('Error al guardar: ' + (err.response?.data?.error || err.message))
      setSaveError(true)
    } finally {
      setLoading(false)
      setUploading(false)
    }
  }

  function openFileDialog(){ if (uploading || isAdmin) { return } fileInputRef.current?.click() }
  function onDrop(e){ e.preventDefault(); if (uploading || isAdmin) { return } const files = Array.from(e.dataTransfer?.files || []); if (!files.length) return; const synthetic = { target: { files } }; onUpload(synthetic) }
  function onDragOver(e){ e.preventDefault() }
  function onDownloadPhoto(photo){ if (!photo || !photo.url) return; const a = document.createElement('a'); a.href = urlFor(photo.url); a.download = String(photo.filename || photo.id || 'foto'); a.target = '_blank'; document.body.appendChild(a); a.click(); document.body.removeChild(a) }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="h1">Evidencia Fotográfica</h1>
          <p className="muted">HBL {hblId || targetId}</p>
        </div>
        <div className="actions-row">
          <button className="btn btn-outline" onClick={() => navigate(-1)}>← Volver</button>
        </div>
      </div>

      <div className="card">

        <div style={{ marginTop:'12px' }}>
          <h2 className="h2" style={{ display:'flex', alignItems:'center', gap:8 }}>Evidencia {uploading ? (<svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="#c0c4c9" strokeWidth="3" fill="none" opacity="0.25"/><path d="M12 2a10 10 0 0 1 0 20" stroke="var(--brand)" strokeWidth="3" fill="none"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>) : null}</h2>
          <div className="dropzone" onClick={isAdmin ? undefined : openFileDialog} onDrop={onDrop} onDragOver={onDragOver}>
            {uploading ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, flexDirection:'column' }}>
                <div style={{ width:'100%', maxWidth:320, height:12, background:'#e5e7eb', borderRadius:6, overflow:'hidden' }}>
                  <div style={{ width: uploadProgress + '%', height:'100%', background:'var(--brand)', transition:'width .2s' }} />
                </div>
                <div className="muted">{uploadProgress}%</div>
              </div>
            ) : (
              <>
                Arrastra y suelta archivos aquí<br/>
                o haz clic para buscar
              </>
            )}
          </div>
          <div className="actions" style={{ justifyContent:'flex-start' }}>
            {!isAdmin && (
              <>
                <button className="btn btn-primary" onClick={openFileDialog} disabled={uploading || loading}>Subir Archivo</button>
                <button className="btn btn-outline" onClick={openFileDialog} disabled={uploading || loading}>Tomar Foto</button>
              </>
            )}
          </div>
          {!isAdmin && (<input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" style={{ display:'none' }} onChange={onUpload} disabled={loading || uploading} />)}
        </div>

        

        {orderedPhotos.length === 0 ? (
          <p className="muted">Aún no hay fotos para este HBL.</p>
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
                    <th>Avería</th>
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
                        <td><input type="checkbox" checked={!!p.averia} onChange={(e) => onToggleAveria(p.id, e.target.checked)} disabled={isAdmin} /></td>
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
                  <svg width="36" height="36" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="#c0c4c9" strokeWidth="4" fill="none" opacity="0.25"/>
                    <path d="M12 2a10 10 0 0 1 0 20" stroke="var(--brand)" strokeWidth="4" fill="none">
                      <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                    </path>
                  </svg>
                  <div className="muted">Cargando imágenes...</div>
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

export default BLEvidenceChild
