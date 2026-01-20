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
      const userStr = localStorage.getItem('user')
      let key = 'tbMastersCache'
      try { const u = JSON.parse(userStr || '{}'); const uid = String(u?.id || '').trim(); if (uid) key = `tbMastersCache:${uid}` } catch {}
      const cache = JSON.parse(localStorage.getItem(key) || '{}')
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
      const userStr = localStorage.getItem('user')
      let key = 'tbMastersCache'
      try { const u = JSON.parse(userStr || '{}'); const uid = String(u?.id || '').trim(); if (uid) key = `tbMastersCache:${uid}` } catch {}
      const cache = JSON.parse(localStorage.getItem(key) || '{}')
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
      const userStr = localStorage.getItem('user')
      let key = 'tbMastersCache'
      try { const u = JSON.parse(userStr || '{}'); const uid = String(u?.id || '').trim(); if (uid) key = `tbMastersCache:${uid}` } catch {}
      const cache = JSON.parse(localStorage.getItem(key) || '{}')
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
    const maxSize = 5 * 1024 * 1024
    const valid = files.filter(f => Number(f.size || 0) <= maxSize)
    const skipped = files.length - valid.length
    if (skipped > 0) setStatus('Se omitieron ' + skipped + ' archivo(s) por superar 5MB')
    if (!valid.length) return
    setUploading(true)
    setLoading(true)
    let filesToUse = valid
    try {
      const slug = String(numeroHblCurrent || details.child_id || '')
      const used = []
      ;(Array.isArray(photos) ? photos : []).forEach(p => { const r = parsePrefix(p?.filename || ''); if (r && r.prefix === slug) used.push(r.num) })
      // No checking pendingFiles as we upload immediately
      const start = used.length ? Math.max(...used) + 1 : 1
      filesToUse = valid.map((f, i) => {
        const original = String(f.name || '')
        const dot = original.lastIndexOf('.')
        const ext = dot >= 0 ? original.slice(dot) : ''
        const newName = `${slug}_${start + i}${ext}`
        return new File([f], newName, { type: f.type })
      })

      // Show local previews temporarily
      const now = Date.now()
      const staged = filesToUse.map((f, i) => ({ id: `${now + i}-local`, filename: f.name, url: URL.createObjectURL(f) }))
      setPhotos(prev => prev.concat(staged))
      
      const total = filesToUse.length
      let uploaded = 0

      for (const f of filesToUse) {
        // Upload file content
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
        fd.append('averia_flags', JSON.stringify({ [f.name]: false }))
        fd.append('crossdoking_flags', JSON.stringify({ [f.name]: false }))
        fd.append('photos', f)

        await API.post('/bls/' + (targetId) + '/photos', fd)
        uploaded += 1
        setStatus('Subiendo imagen ' + uploaded + ' de ' + total)
      }

      setStatus('Fotos subidas correctamente')
      
      // Update recent documents list locally for immediate UI feedback if needed
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
      
      // Refresh photos list from server
      const ref = await API.get('/bls/' + targetId + '/photos')
      let list = Array.isArray(ref.data?.photos) ? ref.data.photos : []
      setPhotos(list)
      
    } catch (err) {
      setStatus('Error al subir fotos: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
      setUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  async function onToggleAveria(photoId, checked) {
    const currentPhoto = (photos || []).find(p => p.id === photoId) || null
    setPhotos(prev => prev.map(p => (p.id === photoId ? { ...p, averia: !!checked } : p)))
    if (String(photoId || '').endsWith('-local')) { setStatus('Avería actualizada (pendiente de guardar)'); return }
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

  async function onToggleCrossdoking(photoId, checked) {
    const currentPhoto = (photos || []).find(p => p.id === photoId) || null
    setPhotos(prev => prev.map(p => (p.id === photoId ? { ...p, crossdoking: !!checked } : p)))
    if (String(photoId || '').endsWith('-local')) { setStatus('Crossdoking actualizado (pendiente de guardar)'); return }
    try {
      const tid = String(hblId || targetId || '')
      if (!tid) return
      await API.patch('/bls/' + tid + '/photos/crossdoking', { flags: { [photoId]: !!checked } })
      if (currentPhoto && currentPhoto.url) {
        const res = await fetch(urlFor(currentPhoto.url))
        const blob = await res.blob()
        const contentBase64 = await blobToBase64(blob)
        const name = String(currentPhoto.filename || '')
        const dot = name.lastIndexOf('.')
        const baseName = dot >= 0 ? name.slice(0, dot) : name
        const ext = extFor(currentPhoto, blob.type)
        const category = checked ? 'Crossdoking' : ''
        const doc = { name: baseName, extension: ext, category, date: dayjs().format('DD/MM/YYYY'), contentBase64 }
        const payload = { referenceNumber: String(numeroHblCurrent || targetId || ''), doNumber: String(details.numero_DO_hijo || details.numero_DO_master || ''), type: 'hijo', documents: [doc] }
        await API.post(EVIDENCE_ENDPOINT, payload)
      }
      setStatus('Crossdoking actualizado')
    } catch (err) {
      setStatus('Error al actualizar Crossdoking: ' + (err.response?.data?.error || err.message))
      setPhotos(prev => prev.map(p => (p.id === photoId ? { ...p, crossdoking: !checked } : p)))
    }
  }

  async function onDeleteConfirmed() {
    const photoId = confirmPhoto?.id
    if (!photoId) { setConfirmPhoto(null); return }
    if (String(photoId).endsWith('-local')) {
      try {
        setPhotos(prev => prev.filter(p => p.id !== photoId))
        setPendingFiles(prev => {
          const next = prev.slice()
          const idx = next.findIndex(f => String(f.name || '') === String(confirmPhoto?.filename || ''))
          if (idx >= 0) next.splice(idx, 1)
          return next
        })
        try { if (confirmPhoto?.url) URL.revokeObjectURL(confirmPhoto.url) } catch {}
        setRecentDocuments(prev => {
          const name = String(confirmPhoto?.filename || '')
          const dot = name.lastIndexOf('.')
          const baseName = dot >= 0 ? name.slice(0, dot) : name
          return prev.filter(d => String(d.name || '') !== baseName)
        })
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
      if (pendingFiles.length) {
        setUploading(true)
        setUploadProgress(0)
        const total = pendingFiles.length
        let uploaded = 0
        let newPhotos = []
        let allOk = true
        for (const f of pendingFiles) {
          const name = String(f.name || '')
          const dot = name.lastIndexOf('.')
          const baseName = dot >= 0 ? name.slice(0, dot) : name
          const ext = extFor({ filename: name }, f.type)
          const date = dayjs().format('DD/MM/YYYY')
          const averiaForFile = !!(photos || []).find(p => String(p.filename || '') === String(f.name || '') && !!p.averia)
          const crossdokingForFile = !!(photos || []).find(p => String(p.filename || '') === String(f.name || '') && !!p.crossdoking)
          const contentBase64 = await blobToBase64(f)
          const documents = []
          let category = ''
          if (averiaForFile && crossdokingForFile) {
            category = 'averia_crossdoking'
          } else if (averiaForFile) {
            category = 'averia'
          } else if (crossdokingForFile) {
            category = 'crossdoking'
          }
          documents.push({ name: baseName, extension: ext, category, date, contentBase64 })
          const payload = { referenceNumber: String(numeroHblCurrent || targetId || ''), doNumber: String(details.numero_DO_hijo || details.numero_DO_master || ''), type: 'hijo', documents }
          const resEv = await API.post(EVIDENCE_ENDPOINT, payload)
          const okEv = resEv && resEv.status >= 200 && resEv.status < 300 && (resEv.data?.success !== false)
          if (!okEv) { allOk = false; setSaveError(true); setStatus('Error en envío de evidencias para ' + baseName); break }
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
          fd.append('averia_flags', JSON.stringify({ [f.name]: averiaForFile }))
          fd.append('crossdoking_flags', JSON.stringify({ [f.name]: crossdokingForFile }))
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
          const ref = await API.get('/bls/' + tid + '/photos')
          let list = Array.isArray(ref.data?.photos) ? ref.data.photos : newPhotos
          setPhotos(list)
        } catch {
          setPhotos(prev => {
            const acc = []
            const seen = new Set()
            ;(Array.isArray(prev) ? prev : []).filter(p => !String(p.id||'').endsWith('-local')).forEach(p => { const key = String(p.id || p.filename || ''); if (!seen.has(key)) { seen.add(key); acc.push(p) } })
            newPhotos.forEach(p => { const key = String(p.id || p.filename || ''); if (!seen.has(key)) { seen.add(key); acc.push(p) } })
            return acc
          })
        }
        setUploading(false)
        setHasNewUploads(false)
        if (allOk) setPendingFiles([])
      }
      const flagsExisting = {}
      const crossdokingExisting = {}
      ;(photos || []).forEach(p => { 
        if (!String(p.id||'').endsWith('-local')) {
          flagsExisting[p.id] = !!p.averia 
          crossdokingExisting[p.id] = !!p.crossdoking
        }
      })
      if (Object.keys(flagsExisting).length) {
        const resPatch = await API.patch('/bls/' + (hblId || targetId) + '/photos/averia', { flags: flagsExisting })
        const okPatch = resPatch && resPatch.status >= 200 && resPatch.status < 300
        if (!okPatch) throw new Error('Error en actualización de avería')
      }
      if (Object.keys(crossdokingExisting).length) {
        const resPatchCross = await API.patch('/bls/' + (hblId || targetId) + '/photos/crossdoking', { flags: crossdokingExisting })
        const okPatchCross = resPatchCross && resPatchCross.status >= 200 && resPatchCross.status < 300
        if (!okPatchCross) throw new Error('Error en actualización de Crossdoking')
      }
      setRecentPhotoIds([])
      setRecentDocuments([])
      if (!saveError) setStatus('Guardado correctamente')
    } catch (err) {
      setStatus('Error al guardar: ' + (err.response?.data?.error || err.message))
      setSaveError(true)
    } finally {
      setLoading(false)
      setUploading(false)
    }
  }

  const fileInputCameraRef = useRef()

  function openFileDialog(){ if (uploading || isAdmin) { return } fileInputRef.current?.click() }
  function openCameraDialog(){ if (uploading || isAdmin) { return } fileInputCameraRef.current?.click() }
  function onDrop(e){ e.preventDefault(); if (uploading || isAdmin) { return } const files = Array.from(e.dataTransfer?.files || []); if (!files.length) return; const synthetic = { target: { files } }; onUpload(synthetic) }
  function onDragOver(e){ e.preventDefault() }
  function onDownloadPhoto(photo){ if (!photo || !photo.url) return; const a = document.createElement('a'); a.href = urlFor(photo.url); a.download = String(photo.filename || photo.id || 'foto'); a.target = '_blank'; document.body.appendChild(a); a.click(); document.body.removeChild(a) }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="h1">Evidencia para {hblId || 'BL'}</h1>
          <p className="muted">
            Gestiona las fotografías y documentos asociados a este BL. 
            Utiliza "Tomar foto o Subir Fotos" para agregar evidencia visual.
          </p>
        </div>
        <div className="actions-row">
          <button className="btn btn-outline" onClick={() => navigate('/bl/' + (masterId || targetId))}>← Volver</button>
        </div>
      </div>

      <div className="card">

        <div style={{ marginTop:'12px' }}>
          <h2 className="h2" style={{ display:'flex', alignItems:'center', gap:8 }}>Evidencia {uploading ? (<svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="#c0c4c9" strokeWidth="3" fill="none" opacity="0.25"/><path d="M12 2a10 10 0 0 1 0 20" stroke="var(--brand)" strokeWidth="3" fill="none"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>) : null}</h2>
          {!isAdmin && !isMobile && (
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
          )}
          <div className="actions" style={{ justifyContent:'flex-start', gap: '8px' }}>
            {!isAdmin && (
              <>
                <button className="btn btn-primary" onClick={openCameraDialog} disabled={uploading || loading}>
                  {uploading ? `Subiendo ${uploadProgress}%...` : 'Tomar Foto'}
                </button>
                <button className="btn btn-outline" onClick={openFileDialog} disabled={uploading || loading}>
                  Subir Fotos
                </button>
              </>
            )}
          </div>
          {!isAdmin && (<input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display:'none' }} onChange={onUpload} disabled={loading || uploading} />)}
          {!isAdmin && (<input ref={fileInputCameraRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={onUpload} disabled={loading || uploading} />)}
          {status && <p className="muted">{status}</p>}
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
                    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--brand)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.filename || p.id}>
                        {p.filename || p.id}
                      </div>
                      
                      <div className="muted" style={{ fontSize: 11, lineHeight: '1.4' }}>
                        <div style={{ whiteSpace: 'nowrap' }}>{fecha}</div>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{usuario}</div>
                      </div>

                      {!isAdmin && (
                        <>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, padding: '6px 8px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                            <input 
                              type="checkbox" 
                              checked={!!p.averia} 
                              onChange={(e) => onToggleAveria(p.id, e.target.checked)} 
                              style={{ width: 16, height: 16, margin: 0 }}
                              disabled={String(p.id).endsWith('-local')}
                            />
                            <span style={{ fontWeight: 500 }}>Avería</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, padding: '6px 8px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                            <input 
                              type="checkbox" 
                              checked={!!p.crossdoking} 
                              onChange={(e) => onToggleCrossdoking(p.id, e.target.checked)} 
                              style={{ width: 16, height: 16, margin: 0 }}
                              disabled={String(p.id).endsWith('-local')}
                            />
                            <span style={{ fontWeight: 500 }}>Crossdoking</span>
                          </label>
                        </>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <button className="btn btn-outline btn-small" onClick={() => setSelectedPhoto(p)} style={{ width: '100%', padding: '6px 2px' }}>Ver</button>
                        <button className="btn btn-outline btn-small" onClick={() => onDownloadPhoto(p)} disabled={!p.url} style={{ width: '100%', padding: '6px 2px' }}>Descargar</button>
                        {!isAdmin && (
                          <button className="btn btn-danger btn-small" onClick={() => setConfirmPhoto(p)} disabled={loading} style={{ gridColumn: '1 / -1', width: '100%' }}>
                            Eliminar
                          </button>
                        )}
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
                    <th>Crossdoking</th>
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
                        <td><input type="checkbox" checked={!!p.averia} onChange={(e) => onToggleAveria(p.id, e.target.checked)} disabled={isAdmin || String(p.id).endsWith('-local')} /></td>
                        <td><input type="checkbox" checked={!!p.crossdoking} onChange={(e) => onToggleCrossdoking(p.id, e.target.checked)} disabled={isAdmin || String(p.id).endsWith('-local')} /></td>
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
          {!isAdmin && <button className="btn btn-info" onClick={onSave} disabled={loading}>Guardar</button>}
        </div>

        {isMobile && !isAdmin && (pendingFiles.length > 0 || uploading) && (
          <>
            <div className="bottom-spacer" />
            <div className="bottom-bar">
              <button className="btn btn-primary" onClick={openCameraDialog} disabled={uploading || loading}>Cámara</button>
              <button className="btn btn-outline" onClick={openFileDialog} disabled={uploading || loading}>Subir</button>
              <button className="btn btn-info" onClick={onSave} disabled={loading}>Guardar</button>
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
