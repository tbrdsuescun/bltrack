import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import API, { EVIDENCE_ENDPOINT } from '../lib/api.js'
import { useUpload } from '../lib/UploadContext.jsx'

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

function parsePrefix(filename) {
  const s = String(filename || '')
  const dot = s.lastIndexOf('.')
  const base = dot >= 0 ? s.slice(0, dot) : s
  const ext = dot >= 0 ? s.slice(dot) : ''

  const sorted = [...PREFIXES].sort((a, b) => b.slug.length - a.slug.length)
  for (const item of sorted) {
    const p = item.slug
    if (base === p || base.startsWith(p + '_')) {
      const remainder = base.length === p.length ? '' : base.slice(p.length + 1)
      if (!remainder) continue
      const parts = remainder.split('_')
      const numStr = parts[parts.length - 1]
      const num = Number(numStr)
      if (Number.isFinite(num)) {
        const container = parts.slice(0, parts.length - 1).join('_')
        return { prefix: p, container, num, ext }
      }
    }
  }

  const parts = base.split('_')
  if (parts.length < 2) return null
  const numStr = parts[parts.length - 1]
  const num = Number(numStr)
  if (!Number.isFinite(num)) return null
  const prefix = parts[0]
  const container = parts.length >= 3 ? parts.slice(1, parts.length - 1).join('_') : ''
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
  const { addTasks, queue, removeTasks } = useUpload()
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
  const [blNieto, setBlNieto] = useState('')
  const [selectedContainer, setSelectedContainer] = useState('')
  const [counters, setCounters] = useState({})
  const [prefixModalOpen, setPrefixModalOpen] = useState(false)
  const [prefixError, setPrefixError] = useState(false)
  const [containerModalOpen, setContainerModalOpen] = useState(false)
  const [containerError, setContainerError] = useState(false)
  const containers = useMemo(() => {
    const gathered = new Set()
    const entry = cacheEntry || {}
    const visited = new Set()

    const extractFrom = (item) => {
      if (!item || typeof item !== 'object') return
      if (visited.has(item)) return
      visited.add(item)

      // Propiedades directas de contenedor
      const direct = item.numeroContenedor || item.numero_contenedor || item.contenedor || item.container || item.numero || item.equipmentId || item.unitId
      if (direct && (typeof direct === 'string' || typeof direct === 'number')) {
        const s = String(direct).trim()
        // Evitar agregar IDs numéricos pequeños que parezcan falsos positivos, aunque aceptamos todo por ahora
        if (s.length > 2) gathered.add(s)
      }

      // Listas de contenedores
      const listKeys = ['contenedores', 'containers', 'units', 'equipments']
      listKeys.forEach(key => {
        const list = item[key]
        if (Array.isArray(list)) {
          list.forEach(c => {
            if (!c) return
            if (typeof c === 'string' || typeof c === 'number') gathered.add(String(c).trim())
            else extractFrom(c)
          })
        }
      })

      // Estructuras anidadas (hijos, master, data, etc.)
      const childKeys = ['hijos', 'childs', 'children', 'subOrders', 'items', 'master', 'data', 'details']
      childKeys.forEach(key => {
        const val = item[key]
        if (Array.isArray(val)) val.forEach(extractFrom)
        else if (val && typeof val === 'object') extractFrom(val)
      })
    }

    extractFrom(entry)
    
    return Array.from(gathered).filter(Boolean).sort().map(v => ({ label: v, value: v }))
  }, [cacheEntry])
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  useEffect(() => { const onResize = () => setIsMobile(window.innerWidth <= 768); window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize) }, [])
  const isAdmin = (() => { try { const u = JSON.parse(localStorage.getItem('user') || '{}'); return String(u.role || '') === 'admin' } catch { return false } })()

  const details = useMemo(() => {
    try {
      const userStr = localStorage.getItem('user')
      let key = 'tbMastersCache'
      try { const u = JSON.parse(userStr || '{}'); const uid = String(u?.id || '').trim(); if (uid) key = `tbMastersCache:${uid}` } catch {}
      const cache = JSON.parse(localStorage.getItem(key) || '{}')
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
    API.get('/bls/' + tid + '/photos?type=master').then(async (res) => {
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
      const entryMaster = arr.find(x => (x.numeroMaster || '') && String(x.numeroMaster) === String(tid))
      if (entryMaster) setCacheEntry(entryMaster)
    } catch {}

    // Fetch full details from API to ensure we have containers (which might be missing in cache)
    API.get(`/external/masters/${tid}`).then(res => {
      if (!mounted) return
      const fullData = res.data?.data || res.data
      if (fullData) {
        setCacheEntry(prev => ({ ...(prev || {}), ...fullData }))
        try {
          const userStr = localStorage.getItem('user')
          let key = 'tbMastersCache'
          try { const u = JSON.parse(userStr || '{}'); const uid = String(u?.id || '').trim(); if (uid) key = `tbMastersCache:${uid}` } catch {}
          const cache = JSON.parse(localStorage.getItem(key) || '{}')
          let arr = Array.isArray(cache.data) ? cache.data : []
          const idx = arr.findIndex(x => String(x.numeroMaster || '') === String(tid))
          if (idx >= 0) {
            arr[idx] = { ...arr[idx], ...fullData }
          } else {
            arr.push(fullData)
          }
          cache.data = arr
          localStorage.setItem(key, JSON.stringify(cache))
        } catch (e) {
          console.warn('Error updating cache', e)
        }
      }
    }).catch(err => {
      console.warn('Could not fetch master details:', err)
    })

    return () => { mounted = false }
  }, [targetId])

  const orderedPhotos = useMemo(() => {
    const parseTs = (p) => {
      const raw = String(p.id || '')
      const n = Number((raw.split('-')[0]) || 0)
      return Number.isFinite(n) ? n : 0
    }
    const validSlugs = new Set(PREFIXES.map(x => x.slug))
    const arr = (photos || [])
      .filter(p => {
        if (!p || !p.id || !p.url) return false
        const r = parsePrefix(p.filename || '')
        if (!r || !validSlugs.has(r.prefix)) return false
        return true
      })
      .slice()
    const cont = String(selectedContainer || '').trim()
    const filtered = cont ? arr.filter(p => { 
      const r = parsePrefix(p?.filename || '')
      const fileCont = String(r?.container || '')
      return fileCont === cont || fileCont.startsWith(cont + '_')
    }) : arr
    return filtered.sort((a, b) => parseTs(a) - parseTs(b))
  }, [photos, selectedContainer])

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
      const targetContainerPart = selectedContainer 
        ? (selectedContainer + (blNieto ? '_' + blNieto : '')) 
        : (blNieto ? blNieto : '')
      
      ;(Array.isArray(photos) ? photos : []).forEach(p => { 
        const r = parsePrefix(p?.filename || '')
        if (r && r.prefix === slug && r.container === targetContainerPart) used.push(r.num) 
      })
      
      const start = used.length ? Math.max(...used) + 1 : 1
      filesToUse = valid.map((f, i) => {
        const original = String(f.name || '')
        const dot = original.lastIndexOf('.')
        const ext = dot >= 0 ? original.slice(dot) : ''
        const cont = selectedContainer ? `${selectedContainer}_` : ''
        const nietoPart = blNieto ? `${blNieto}_` : ''
        const newName = `${slug}_${cont}${nietoPart}${start + i}${ext}`
        return new File([f], newName, { type: f.type })
      })

      const now = Date.now()
      const staged = filesToUse.map((f, i) => ({ id: `${now + i}-local`, filename: f.name, url: URL.createObjectURL(f) }))
      setPhotos(prev => prev.concat(staged))
      // setPendingFiles(prev => prev.concat(filesToUse))

      const currentDetails = { ...details }
      const currentMasterId = masterId || targetId
      const currentPrefix = selectedPrefix
      const currentContainer = selectedContainer
      const currentCache = cacheEntry

      const newTasks = filesToUse.map((f, i) => {
          const localId = `${now + i}-local`
          const name = String(f.name || '')
          const dot = name.lastIndexOf('.')
          const baseName = dot >= 0 ? name.slice(0, dot) : name
          const ext = extFor({ filename: name }, f.type)
          const date = dayjs().format('DD/MM/YYYY')
          const r = parsePrefix(name)
          const category = (r?.prefix === 'averia') ? 'averia' : ''
          
          return {
            id: Math.random().toString(36).slice(2),
            contextId: 'master-' + targetId,
            label: `Subiendo ${name}`,
            run: async () => {
               console.log('[BLEvidenceMaster] Immediate upload task started for:', name)
               try {
                   // 1. Upload to DB (First)
                   const fd = new FormData()
                   const masterIdVal = String(currentMasterId || '')
                   fd.append('master_id', masterIdVal)
                   fd.append('numero_DO_master', String(currentDetails.numero_DO_master || ''))
                   fd.append('type', 'master')
                   if (currentPrefix) fd.append('prefix', currentPrefix)
                   if (currentContainer) fd.append('contenedor', currentContainer)
                   if (currentCache) {
                     fd.append('cliente_nit', String(currentCache.nitCliente || currentCache.clienteNit || currentCache.nit || ''))
                     fd.append('descripcion_mercancia', String(currentCache.descripcionMercancia || currentCache.descripcion || ''))
                     fd.append('numero_pedido', String(currentCache.numeroPedido || currentCache.pedido || currentCache.orderNumber || ''))
                   }
                   fd.append('photos', f)
                   
                   console.log('[BLEvidenceMaster] Sending photo content to DB (First)')
                   const resDb = await API.post('/bls/' + (targetId) + '/photos?type=master', fd)
                   const uploaded = resDb.data?.photos?.[0]
                   if (uploaded && uploaded.id) {
                     setPhotos(prev => prev.map(p => (p.id === localId ? { ...p, id: uploaded.id } : p)))
                   }

                   // 2. Evidence (Second)
                   const contentBase64 = await blobToBase64(f)
                   const payload = { 
                     referenceNumber: String(currentDetails.master_id || ''), 
                     doNumber: String(currentDetails.numero_DO_master || ''), 
                     type: 'master', 
                     documents: [{ name: baseName, extension: ext, category, date, contentBase64 }] 
                   }
                   
                   console.log('[BLEvidenceMaster] Sending metadata to EVIDENCE_ENDPOINT:', payload)
                   const resEv = await API.post(EVIDENCE_ENDPOINT, payload)
                   console.log('[BLEvidenceMaster] Metadata response:', resEv.status, resEv.data)
  
                   const okEv = resEv && resEv.status >= 200 && resEv.status < 300 && (resEv.data?.success !== false)
                   if (!okEv) throw new Error('Error en envío de evidencias para ' + baseName)
               } catch (error) {
                   console.error('[BLEvidenceMaster] Task error for:', name, error)
                   throw error
               }
            }
          }
      })
      
      addTasks(newTasks)
      
      // Update counters immediately for UI consistency
      filesToUse.forEach((f, i) => {
        const key = slug + '__' + (selectedContainer || '')
        setCounters(prev => ({ ...prev, [key]: start + i + 1 }))
      })

    } catch (err) {
      setStatus('Error al procesar fotos: ' + err.message)
    } finally {
      setLoading(false)
      setUploading(false)
      if (e.target) e.target.value = ''
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
        // Update master_children record on delete
        try {
            const fd = new FormData()
            fd.append('master_id', String(targetId || ''))
            fd.append('numero_DO_master', String(details.numero_DO_master || ''))
            fd.append('type', 'master')
            if (cacheEntry) {
                fd.append('cliente_nit', String(cacheEntry.nitCliente || cacheEntry.clienteNit || cacheEntry.nit || ''))
            }
            await API.post('/bls/' + targetId + '/photos?type=master', fd)
        } catch (e) { console.warn('Failed to update master record on delete', e) }

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
    setStatus('Verificando fotos en base de datos...')
    console.log('[BLEvidenceMaster] onSave clicked.')
    
    setSaveModalOpen(true)
    
    try {
        // 0. Ensure master_children record exists/updates with type='master'
        try {
            const fd = new FormData()
            fd.append('master_id', String(targetId || ''))
            fd.append('numero_DO_master', String(details.numero_DO_master || ''))
            fd.append('type', 'master')
            if (cacheEntry) {
                fd.append('cliente_nit', String(cacheEntry.nitCliente || cacheEntry.clienteNit || cacheEntry.nit || ''))
                fd.append('descripcion_mercancia', String(cacheEntry.descripcionMercancia || cacheEntry.descripcion || ''))
                fd.append('numero_pedido', String(cacheEntry.numeroPedido || cacheEntry.pedido || cacheEntry.orderNumber || ''))
            }
            await API.post('/bls/' + targetId + '/photos?type=master', fd)
            console.log('[BLEvidenceMaster] Master record updated in internal DB')
        } catch (e) {
            console.warn('[BLEvidenceMaster] Failed to update master record:', e)
        }

        // 1. Fetch current photos from DB
        console.log('[BLEvidenceMaster] Fetching latest photos from DB...')
        const resPhotos = await API.get('/bls/' + targetId + '/photos')
        const dbPhotos = Array.isArray(resPhotos.data?.photos) ? resPhotos.data.photos : []
        console.log('[BLEvidenceMaster] DB Photos found:', dbPhotos.length)

        const tasks = []

        // 2. Identify DB photos for this Master/Container/Prefix
        dbPhotos.forEach(p => {
             const pName = String(p.filename || '')
             
             const dot = pName.lastIndexOf('.')
             const baseName = dot >= 0 ? pName.slice(0, dot) : pName
             const ext = extFor({ filename: pName }, p.mimetype || 'image/jpeg')
             const date = dayjs().format('DD/MM/YYYY')
             
             const r = parsePrefix(pName)
             const category = (r?.prefix === 'averia') ? 'averia' : ''

             const currentDetails = { ...details }
             
             tasks.push({
                 id: `sync-${p.id || pName}-${Date.now()}`,
                 contextId: 'master-' + targetId,
                 label: `Sincronizando ${pName}`,
                 run: async () => {
                     console.log('[BLEvidenceMaster] Sync task started for:', pName)
                     
                     let blob = null
                     try {
                         const imgUrl = p.url
                         console.log('[BLEvidenceMaster] Fetching image blob from:', imgUrl)
                         const resBlob = await API.get(imgUrl, { responseType: 'blob' })
                         blob = resBlob.data
                     } catch (err) {
                         console.error('[BLEvidenceMaster] Error fetching image blob:', err)
                         throw new Error(`No se pudo descargar la imagen ${pName}`)
                     }

                     const contentBase64 = await blobToBase64(blob)
                     
                     const payload = { 
                       referenceNumber: String(currentDetails.master_id || ''), 
                       doNumber: String(currentDetails.numero_DO_master || ''), 
                       type: 'master', 
                       documents: [{ name: baseName, extension: ext, category, date, contentBase64 }] 
                     }
                     
                     console.log('[BLEvidenceMaster] Sending existing photo to EVIDENCE_ENDPOINT:', payload)
                     const resEv = await API.post(EVIDENCE_ENDPOINT, payload)
                     console.log('[BLEvidenceMaster] Metadata response:', resEv.status)

                     const okEv = resEv && resEv.status >= 200 && resEv.status < 300 && (resEv.data?.success !== false)
                     if (!okEv) throw new Error('Error enviando a endpoint externo')
                 }
             })
        })

        // 3. Process Pending Files (New Uploads)
        // NOTE: Pending files are now uploaded immediately in onUpload.
        if (pendingFiles.length) {
            console.log('[BLEvidenceMaster] Clearing legacy pending files queue')
            setPendingFiles([])
        }
        
        if (tasks.length > 0) {
            console.log('[BLEvidenceMaster] Dispatching total tasks:', tasks.length)
            addTasks(tasks)
            setPendingFiles([])
            setStatus(`Se iniciaron ${tasks.length} el cargue de las fotos.`)
        } else {
            console.log('[BLEvidenceMaster] No tasks created.')
            setStatus('No hay fotos nuevas ni existentes para procesar.')
        }
        
        setTimeout(() => {
            setSaveModalOpen(false)
            setStatus(null)
        }, 2500)

    } catch (err) {
        console.error('[BLEvidenceMaster] Error in onSave:', err)
        setStatus('Error verificando base de datos: ' + err.message)
    }
  }

  const fileInputCameraRef = useRef()

  function openFileDialog(){ if (uploading || isAdmin) { return } if (containers.length && !selectedContainer) { setStatus('Selecciona un contenedor'); setContainerError(true); setContainerModalOpen(true); return } if (!selectedPrefix) { setStatus('Selecciona un prefijo para nombrar las fotos'); setPrefixError(true); setPrefixModalOpen(true); return } fileInputRef.current?.click() }
  function openCameraDialog(){ if (uploading || isAdmin) { return } if (containers.length && !selectedContainer) { setStatus('Selecciona un contenedor'); setContainerError(true); setContainerModalOpen(true); return } if (!selectedPrefix) { setStatus('Selecciona un prefijo para nombrar las fotos'); setPrefixError(true); setPrefixModalOpen(true); return } fileInputCameraRef.current?.click() }
  function onDrop(e){ e.preventDefault(); if (uploading || isAdmin) { return } if (containers.length && !selectedContainer) { setStatus('Selecciona un contenedor'); setContainerError(true); setContainerModalOpen(true); return } if (!selectedPrefix) { setStatus('Selecciona un prefijo para nombrar las fotos'); setPrefixError(true); setPrefixModalOpen(true); return } const files = Array.from(e.dataTransfer?.files || []); if (!files.length) return; const synthetic = { target: { files } }; onUpload(synthetic) }
  function onDragOver(e){ e.preventDefault() }

  function urlFor(u) { const s = String(u || ''); if (!s) return ''; if (/^(?:https?:\/\/|blob:|data:)/.test(s)) return s; const base = API.defaults?.baseURL || ''; return base ? (base + (s.startsWith('/') ? s : ('/' + s))) : s }
  function onDownloadPhoto(photo){ if (!photo || !photo.url) return; const a = document.createElement('a'); a.href = urlFor(photo.url); a.download = String(photo.filename || photo.id || 'foto'); a.target = '_blank'; document.body.appendChild(a); a.click(); document.body.removeChild(a) }

  const localTasks = queue.filter(t => t.contextId === 'master-' + targetId)
  const allFinished = localTasks.length > 0 && localTasks.every(t => t.status === 'completed' || t.status === 'failed')

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="h1">Evidencia para Master {masterId || targetId}</h1>
          <p className="muted">
            Gestiona las fotografías y documentos asociados a este Master BL.
            Los cambios se guardan automáticamente al confirmar.
          </p>
        </div>
        <div className="actions-row">
          <button className="btn btn-outline" onClick={() => navigate('/bl/' + (masterId || targetId))}>← Volver</button>
        </div>
      </div>

      {localTasks.length > 0 && (
        <div style={{ marginBottom: 20, padding: 15, border: '1px solid #e5e7eb', borderRadius: 8, background: '#f9fafb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
             <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Subidas en curso</h3>
             {allFinished && (
               <button 
                 onClick={() => removeTasks(localTasks.map(t => t.id))}
                 style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.2rem', color: '#6b7280' }}
                 title="Cerrar y limpiar tareas completadas"
               >
                 ✕
               </button>
             )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {localTasks.map(t => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                <span>{t.label}</span>
                <span style={{ 
                  padding: '2px 8px', borderRadius: 4, fontSize: 12,
                  background: t.status === 'completed' ? '#dcfce7' : t.status === 'failed' ? '#fee2e2' : '#dbeafe',
                  color: t.status === 'completed' ? '#166534' : t.status === 'failed' ? '#991b1b' : '#1e40af'
                }}>
                  {t.status === 'pending' ? 'Pendiente' : t.status === 'uploading' ? 'Subiendo...' : t.status === 'failed' ? 'Falló' : 'Completado'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="grid-2">
          <label className="label">Contenedor
            <select className="input" value={selectedContainer} onChange={(e) => { const v = e.target.value; setSelectedContainer(v); if (v) { setContainerError(false); setContainerModalOpen(false) } }}>
              <option value="">Selecciona contenedor</option>
              {containers.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          {!isAdmin && (
            <label className="label">Prefijo para nombrar
              <select className="input" value={selectedPrefix} onChange={(e) => { const v = e.target.value; setSelectedPrefix(v); if (v) { setPrefixError(false); setPrefixModalOpen(false) } }}>
                <option value="">Selecciona prefijo</option>
                {PREFIXES.map(o => <option key={o.slug} value={o.slug}>{o.label}</option>)}
              </select>
            </label>
          )}
          {!isAdmin && (
            <label className="label">BL Nieto (Opcional)
              <input 
                type="text" 
                className="input" 
                placeholder="Ej: 12345" 
                value={blNieto} 
                onChange={(e) => setBlNieto(e.target.value.replace(/[^0-9]/g, ''))} 
              />
            </label>
          )}
        </div>

        <div style={{ marginTop:'12px' }}>
          <h2 className="h2" style={{ display:'flex', alignItems:'center', gap:8 }}>Evidencia {uploading ? (<svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="#c0c4c9" strokeWidth="3" fill="none" opacity="0.25"/><path d="M12 2a10 10 0 0 1 0 20" stroke="var(--brand)" strokeWidth="3" fill="none"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>) : null}</h2>
          {!isAdmin && !isMobile && (
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
                <button className="btn btn-primary" onClick={openCameraDialog} disabled={uploading || loading}>Tomar Foto</button>
                <button className="btn btn-outline" onClick={openFileDialog} disabled={uploading || loading}>Subir Fotos</button>
              </>
            )}
          </div>
          {!isAdmin && (<input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display:'none' }} onChange={onUpload} disabled={loading || uploading} />)}
          {!isAdmin && (<input ref={fileInputCameraRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={onUpload} disabled={loading || uploading} />)}
        
        {status && <p className="muted" style={(prefixError || containerError) ? { color: '#e11' } : undefined}>{status}</p>}
        </div>

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
          {!isAdmin && !allFinished && <button className="btn btn-info" onClick={onSave} disabled={loading}>Guardar</button>}
        </div>

        {isMobile && !isAdmin && (pendingFiles.length > 0 || uploading) && (
          <>
            <div className="bottom-spacer" />
            <div className="bottom-bar">
              <button className="btn btn-primary" onClick={openCameraDialog} disabled={uploading || loading}>Cámara</button>
              <button className="btn btn-info" onClick={openFileDialog} disabled={uploading || loading}>Subir</button>
              {!allFinished && <button className="btn btn-primary" onClick={onSave} disabled={loading}>Guardar</button>}
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
              <button className="btn btn-primary" onClick={() => setSaveModalOpen(false)} disabled={loading}>Aceptar</button>
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
