import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import API from '../lib/api.js'

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
  const [childUseAveria, setChildUseAveria] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [pendingFiles, setPendingFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  useEffect(() => { const onResize = () => setIsMobile(window.innerWidth <= 768); window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize) }, [])

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
    API.get('/bls/' + tid + '/photos').then(res => {
      if (!mounted) return
      const list = Array.isArray(res.data?.photos) ? res.data.photos : []
      setPhotos(list)
    }).catch(() => setPhotos([]))
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
      .filter(p => p && p.id)
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
      const numeroHbl = String(details.child_id || numeroHblCurrent || '').trim()
      const prefix = childUseAveria ? 'averia' : (numeroHbl ? ('hbl_' + numeroHbl) : 'hbl')
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
      const now = Date.now()
      const staged = filesToUse.map((f, i) => ({ id: `${now + i}-local`, filename: f.name, url: URL.createObjectURL(f) }))
      setPendingFiles(prev => prev.concat(filesToUse))
      setPhotos(prev => prev.concat(staged))
      setStatus('Fotos preparadas: ' + staged.length)
    } catch (err) {
      setStatus('Error al preparar fotos: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
      setUploading(false)
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
        pendingFiles.forEach(f => fd.append('photos', f))
        const upRes = await API.post('/bls/' + (hblId || targetId) + '/photos', fd)
        const newPhotos = (upRes.data.photos || []).map(p => ({ ...p, url: p.id ? ('/uploads/' + p.id) : p.url }))
        setPhotos(prev => prev.filter(p => !String(p.id||'').endsWith('-local')).concat(newPhotos))
        setPendingFiles([])
        setUploading(false)
      }

      const payload = {
        master_id: String(details.master_id || ''),
        child_id: String(details.child_id || ''),
        cliente_nombre: String(details.cliente_nombre || ''),
        numero_ie: String(details.numero_ie || ''),
        numero_DO_master: String(details.numero_DO_master || ''),
        numero_DO_hijo: String(details.numero_DO_hijo || ''),
        pais_de_origen: String(details.pais_de_origen || ''),
        puerto_de_origen: String(details.puerto_de_origen || '')
      }
      const syncItem = { ...payload }
      await API.post('/masters/sync', { items: [syncItem] })
      await API.post('/bls/' + (hblId || targetId) + '/send', payload)
      setStatus('Guardado correctamente')
    } catch (err) {
      setStatus('Error al guardar: ' + (err.response?.data?.error || err.message))
      setSaveError(true)
    } finally {
      setLoading(false)
      setUploading(false)
    }
  }

  function openFileDialog(){ if (uploading) { return } fileInputRef.current?.click() }
  function onDrop(e){ e.preventDefault(); if (uploading) { return } const files = Array.from(e.dataTransfer?.files || []); if (!files.length) return; const synthetic = { target: { files } }; onUpload(synthetic) }
  function onDragOver(e){ e.preventDefault() }

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
        <div style={{ border:'1px solid #e5e7eb', borderRadius:8, padding:12, background:'#fff', marginTop:8 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
            <div>
              <div style={{ fontWeight:600, color:'var(--brand)' }}>Nombrado de HBL - Usar 'averia'</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setChildUseAveria(!childUseAveria)}>
              <Toggle checked={childUseAveria} onChange={setChildUseAveria} />
            </div>
          </div>
        </div>

        <div style={{ marginTop:'12px' }}>
          <h2 className="h2" style={{ display:'flex', alignItems:'center', gap:8 }}>Evidencia {uploading ? (<svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="#c0c4c9" strokeWidth="3" fill="none" opacity="0.25"/><path d="M12 2a10 10 0 0 1 0 20" stroke="var(--brand)" strokeWidth="3" fill="none"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>) : null}</h2>
          <div className="dropzone" onClick={openFileDialog} onDrop={onDrop} onDragOver={onDragOver}>
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
          <div className="actions" style={{ justifyContent:'flex-start' }}>
            <button className="btn btn-primary" onClick={openFileDialog} disabled={uploading || loading}>Subir Archivo</button>
            <button className="btn btn-outline" onClick={openFileDialog} disabled={uploading || loading}>Tomar Foto</button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" style={{ display:'none' }} onChange={onUpload} disabled={loading || uploading} />
        </div>

        {status && (
          <div className="muted" style={{ fontSize:12, marginTop:6 }}>
            master_id: {String(details.master_id||'-')} • child_id: {String(details.child_id||'-')} • cliente_nombre: {String(details.cliente_nombre||'-')} • numero_ie: {String(details.numero_ie||'-')} • DO master: {String(details.numero_DO_master||'-')} • DO hijo: {String(details.numero_DO_hijo||'-')} • pais_origen: {String(details.pais_de_origen||'-')} • puerto_origen: {String(details.puerto_de_origen||'-')}
          </div>
        )}

        {orderedPhotos.length === 0 ? (
          <p className="muted">Aún no hay fotos para este HBL.</p>
        ) : (
          isMobile ? (
            <div className="preview-grid">
              {orderedPhotos.map(p => {
                const ts = Number((String(p.id||'').split('-')[0]) || 0)
                const fecha = ts ? dayjs(ts).format('YYYY-MM-DD HH:mm') : '-'
                const user = (() => { try { return JSON.parse(localStorage.getItem('user')||'{}') } catch { return {} } })()
                const usuario = user?.nombre || user?.display_name || user?.email || '-'
                return (
                  <div key={p.id} className="preview-card">
                    {p.url ? (
                      <img src={p.url} alt={p.filename || p.id} onClick={() => setSelectedPhoto(p)} />
                    ) : (
                      <div className="muted" style={{ padding: 12 }}>(sin vista previa)</div>
                    )}
                    <div style={{ padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div className="muted" style={{ fontSize: 12 }}>{fecha} • {usuario}</div>
                      <div>
                        <button className="btn btn-outline btn-small" onClick={() => setSelectedPhoto(p)}>Ver</button>
                        {' '}
                        <button className="btn btn-danger btn-small" onClick={() => setConfirmPhoto(p)} disabled={loading}>Eliminar</button>
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
          )
        )}

        <div className="actions" style={{ justifyContent:'flex-end' }}>
          <button className="btn btn-outline" onClick={onSave} disabled={loading}>Guardar</button>
        </div>

        {isMobile && (pendingFiles.length > 0 || uploading) && (
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
        <div className="modal-backdrop" onClick={(e) => e.stopPropagation()}>
          <div className="modal" style={{ width: '280px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-body" style={{ textAlign:'center' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                <svg width="24" height="24" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" stroke="#c0c4c9" strokeWidth="4" fill="none" opacity="0.25"/>
                  <path d="M12 2a10 10 0 0 1 0 20" stroke="var(--brand)" strokeWidth="4" fill="none">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                  </path>
                </svg>
                <div className="muted">Procesando...</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default BLEvidenceChild