import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import StatusBadge from '../components/StatusBadge.jsx'
import API from '../lib/api.js'
import Layout from '../components/Layout.jsx'
import SearchBar from '../components/SearchBar.jsx'

function BLDetail({ user }) {
  const { blId } = useParams()
  const navigate = useNavigate()
  const [photos, setPhotos] = useState([])
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef()
  const [mastersRaw, setMastersRaw] = useState([])
  const [masterInput, setMasterInput] = useState('')
  const [selectedMaster, setSelectedMaster] = useState('')
  const [doInput, setDoInput] = useState('')
  const [selectedDo, setSelectedDo] = useState('')
  const [childPhotos, setChildPhotos] = useState({})
  const [mineMap, setMineMap] = useState({})
  const [childrenList, setChildrenList] = useState([])
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncActive, setSyncActive] = useState(false)
  useEffect(() => { const onResize = () => setIsMobile(window.innerWidth <= 768); window.addEventListener('resize', onResize); return () => window.removeEventListener('resize', onResize) }, [])
  const isAdmin = (() => { try { const u = JSON.parse(localStorage.getItem('user') || '{}'); return String(u.role || '') === 'admin' } catch { return false } })()
  
  useEffect(() => {
    try {
      const userStr = localStorage.getItem('user')
      let key = 'tbMastersCache'
      try { const u = JSON.parse(userStr || '{}'); const uid = String(u?.id || '').trim(); if (uid) key = `tbMastersCache:${uid}` } catch {}
      const v = JSON.parse(localStorage.getItem(key) || 'null') || window['__MEM_' + key] || {}
      const arr = Array.isArray(v.data) ? v.data : []
      setMastersRaw(arr)
    } catch {
      setMastersRaw([])
    }
  }, [])

  useEffect(() => {
    const t = setInterval(() => {
      try {
        const s = window.MastersSync || {}
        const progress = Math.round(Number(s.progress || 0))
        // If progress is moving (between 0 and 100) consider it active to show loader
        const isActive = String(s.status || '') === 'syncing' || (progress > 0 && progress < 100)
        setSyncProgress(progress)
        setSyncActive(isActive)

        const userStr = localStorage.getItem('user')
        let key = 'tbMastersCache'
        try { const u = JSON.parse(userStr || '{}'); const uid = String(u?.id || '').trim(); if (uid) key = `tbMastersCache:${uid}` } catch {}
        const v = JSON.parse(localStorage.getItem(key) || 'null') || window['__MEM_' + key] || {}
        const arr = Array.isArray(v.data) ? v.data : []
        if (arr.length !== mastersRaw.length) {
          setMastersRaw(arr)
        }
      } catch {}
    }, 200)
    return () => clearInterval(t)
  }, [mastersRaw.length])

  useEffect(() => {
    API.get('/bls/mine').then(res => {
      const list = Array.isArray(res.data?.items) ? res.data.items : []
      const map = {}
      list.forEach(it => { map[it.bl_id] = { photos_count: it.photos_count || 0, send_status: it.send_status || 'pending' } })
      setMineMap(map)
    }).catch(() => setMineMap({}))
  }, [])

  const mastersMap = useMemo(() => {
    const m = {}
    mastersRaw.forEach(x => {
      const k = x.numeroMaster || ''
      if (!k) return
      const children = Array.isArray(x.hijos) ? x.hijos : []
      m[k] = children.map(c => ({
        cliente: c.cliente || '',
        puertoOrigen: c.puertoOrigen || '',
        numeroIE: c.numeroIE || '',
        numeroDo: c.numeroDo || '',
        paisOrigen: c.paisOrigen || '',
        numeroHBL: c.numeroHBL || ''
      }))
    })
    return m
  }, [mastersRaw])
  const mastersOptions = useMemo(() => Object.keys(mastersMap).map(k => ({ label: k, value: k })), [mastersMap])
  const childrenOptions = useMemo(() => selectedMaster ? (mastersMap[selectedMaster] || []).map(ch => ({ label: ch.numeroHBL || '', value: ch.numeroHBL || '' })) : [], [mastersMap, selectedMaster])
  const childrenRows = useMemo(() => {
    if (!selectedMaster) return []
    let rows = Array.isArray(childrenList) ? childrenList : []
    if (selectedDo) rows = rows.filter(ch => String(ch.numeroHBL || '') === String(selectedDo))
    return rows.map(ch => ({
      cliente: ch.cliente || '',
      puertoOrigen: ch.puertoOrigen || '',
      numeroIE: ch.numeroIE || '',
      numeroDo: ch.numeroDo || '',
      paisOrigen: ch.paisOrigen || '',
      numeroHBL: ch.numeroHBL || ''
    }))
  }, [selectedMaster, childrenList, selectedDo])

  useEffect(() => {
    if (!blId) return
    const isMaster = !!mastersMap[blId]
    if (isMaster) {
      setSelectedMaster(blId) 
      setMasterInput(blId)
      setChildrenList(mastersMap[blId] || [])
      setDoInput('')
      setSelectedDo('')
      return
    }
    const found = Object.entries(mastersMap).find(([k, arr]) => (arr || []).some(ch => String(ch.numeroHBL || '') === String(blId)))
    if (found) {
      const [master] = found
      setSelectedMaster(master)
      setMasterInput(master)
      setChildrenList(mastersMap[master] || [])
      setSelectedDo(blId)
      setDoInput(blId)
    }
  }, [blId, mastersMap])

  useEffect(() => {
    if (!selectedMaster) return
    setChildrenList(mastersMap[selectedMaster] || [])
  }, [selectedMaster, mastersMap])

  async function onUpload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length || !selectedDo) { setStatus('Seleccione un hijo (DO) para subir fotos'); return }
    const fd = new FormData()
    files.forEach(f => fd.append('photos', f))
    setLoading(true)
    try {
      const res = await API.post('/bls/' + selectedDo + '/photos', fd)
      const newPhotos = res.data.photos || []
      setChildPhotos(prev => ({ ...prev, [selectedDo]: (prev[selectedDo] || []).concat(newPhotos) }))
      setStatus('Fotos cargadas: ' + newPhotos.length)
      try {
        if (selectedMaster && selectedDo) {
          const entry = (() => { try { const userStr = localStorage.getItem('user'); let key = 'tbMastersCache'; try { const u = JSON.parse(userStr || '{}'); const uid = String(u?.id || '').trim(); if (uid) key = `tbMastersCache:${uid}` } catch {} const v = JSON.parse(localStorage.getItem(key) || '{}'); const arr = Array.isArray(v.data) ? v.data : []; return arr.find(x => String(x.numeroDo||'') === String(selectedDo)) } catch { return null } })()
          const item = {
            master_id: selectedMaster,
            child_id: selectedDo,
            cliente_nombre: entry?.nombreCliente || entry?.clienteNombre || undefined,
            cliente_nit: entry?.nitCliente || entry?.clienteNit || undefined,
            numero_ie: entry?.numeroIE || undefined,
            descripcion_mercancia: entry?.descripcionMercancia || undefined,
            numero_pedido: entry?.numeroPedido || undefined,
          }
          await API.post('/masters/sync', { items: [item] })
        }
      } catch {}
    } catch (err) {
      setStatus('Error al subir fotos: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
    }
  }

  async function onSend() {
    const targetId = selectedMaster || blId
    if (!targetId) return
    setLoading(true)
    try {
      const res = await API.post('/bls/' + targetId + '/send', {})
      setStatus('Enviado: ' + (res.data.status || 'ok'))
    } catch (err) {
      setStatus('Error al enviar: ' + (err.response?.data?.error || err.message))
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
          <h1 className="h1">Nuevo Registro Fotográfico</h1>
          <p className="muted">Selecciona un master para agregar una foto al {blId || 'HBL'}</p>
        </div>
      </div>

      <div className="card">
        {syncActive && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="muted" style={{ fontSize: '0.9rem' }}>Sincronizando masters...</span>
              <span className="muted" style={{ fontSize: '0.9rem' }}>{syncProgress}%</span>
            </div>
            <div style={{ width: '100%', height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${syncProgress}%`, height: '100%', background: 'var(--brand)', transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}
        <div className="grid-2">
          <label className="label">Master
            <SearchBar placeholder="Buscar master" value={masterInput} onChange={e => setMasterInput(e.target.value)} options={mastersOptions} onSelect={(o) => { const v = o.value ?? o.label ?? String(o); setSelectedMaster(v); setMasterInput(String(o.label ?? v)); setDoInput(''); setSelectedDo('') }} fullWidth />
          </label>
          {selectedMaster && (
            <label className="label">Hijo (HBL)
              <SearchBar placeholder="Seleccionar hijo" value={doInput} onChange={e => setDoInput(e.target.value)} options={childrenOptions} onSelect={(o) => { const v = o.value ?? o.label ?? String(o); setSelectedDo(v); setDoInput(String(o.label ?? v)) }} fullWidth />
            </label>
          )}
        </div>
        {selectedMaster && !isAdmin && (
          <div className="actions-row">
            <button className="btn btn-primary" onClick={() => navigate('/evidence/' + selectedMaster)}>Ingresar imágenes al master</button>
          </div>
        )}
        {selectedMaster && (
          childrenRows.length === 0 ? (
            <p className="muted" style={{ marginTop: '12px' }}>No hay hijos para este master.</p>
          ) : (
            <>
            <div style={{ marginTop: '24px', marginBottom: '16px' }}>
              <h2 className="h2">BLs asociados al Master {selectedMaster}</h2>
              <p className="muted">A continuación se listan los BLs vinculados a este Master. Seleccione "Ingresar imágenes" para gestionar la evidencia de cada uno.</p>
            </div>
            {isMobile ? (
              <div className="mobile-card-list" style={{ marginTop: '12px' }}>
                {childrenRows.map(row => (
                  <div key={row.numeroHBL} className="mobile-card">
                    <div className="mobile-card-header">
                      <div style={{ fontWeight: 600 }}>{row.numeroHBL}</div>
                      <div className="muted">Fotos: {mineMap[row.numeroHBL]?.photos_count || 0}</div>
                    </div>
                    <div className="mobile-card-body">
                      <div>
                        <div className="muted">Cliente</div>
                        <div>{row.cliente || '-'}</div>
                      </div>
                      <div>
                        <div className="muted">N° DO</div>
                        <div>{row.numeroDo || '-'}</div>
                      </div>
                      <div>
                        <div className="muted">País</div>
                        <div>{row.paisOrigen || '-'}</div>
                      </div>
                      <div>
                        <div className="muted">Puerto</div>
                        <div>{row.puertoOrigen || '-'}</div>
                      </div>
                    </div>
                    <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                      {!isAdmin && (<button className="btn btn-primary btn-small" onClick={() => navigate('/evidence/' + selectedMaster + '/' + row.numeroHBL)}>Ingresar imágenes</button>)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="table-responsive" style={{ marginTop: '12px' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Puerto Origen</th>
                      <th>Número IE</th>
                      <th>Número DO</th>
                      <th>País Origen</th>
                      <th>Número BL</th>
                      <th>Fotografías</th>
                      <th className="table-actions">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {childrenRows.map(row => (
                      <tr key={row.numeroHBL}>
                        <td>{row.cliente}</td>
                        <td>{row.puertoOrigen}</td>
                        <td>{row.numeroIE}</td>
                        <td>{row.numeroDo}</td>
                        <td>{row.paisOrigen}</td>
                        <td>{row.numeroHBL}</td>
                        <td>{mineMap[row.numeroHBL]?.photos_count || 0}</td>
                        <td className="table-actions">
                          {!isAdmin && <button className="btn btn-primary btn-small" onClick={() => navigate('/evidence/' + selectedMaster + '/' + row.numeroHBL)}>Ingresar imágenes BL</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            </>
          )
        )}
      </div>
    </>
  )
}

export default BLDetail