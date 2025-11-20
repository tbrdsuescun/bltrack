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
  
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem('tbMastersCache') || '{}')
      const arr = Array.isArray(v.data) ? v.data : []
      setMastersRaw(arr)
    } catch {
      setMastersRaw([])
    }
  }, [])

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
      if (!m[k]) m[k] = []
      if (x.numeroDo) m[k].push(x.numeroDo)
    })
    return m
  }, [mastersRaw])
  const mastersOptions = useMemo(() => Object.keys(mastersMap).map(k => ({ label: k, value: k })), [mastersMap])
  const childrenOptions = useMemo(() => selectedMaster ? (mastersMap[selectedMaster] || []).map(d => ({ label: d, value: d })) : [], [mastersMap, selectedMaster])
  const childrenRows = useMemo(() => {
    if (!selectedMaster) return []
    const ids = childrenList
    return ids.map((id, idx) => ({
      numeroBL: id,
      clienteNombre: 'Cliente ' + String(idx + 1).padStart(2, '0'),
      clienteNit: '900' + String(100000 + idx),
      numeroIE: 'IE-' + String(1000 + idx),
      descripcionMercancia: 'Descripción de mercancía ' + (idx + 1),
      numeroPedido: 'PED-' + String(5000 + idx)
    }))
  }, [selectedMaster, childrenList])

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
    const found = Object.entries(mastersMap).find(([k, arr]) => arr.includes(blId))
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
      try { if (selectedMaster && selectedDo) { await API.post('/masters/sync', { items: [{ master_id: selectedMaster, child_id: selectedDo }] }) } } catch {}
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
          <p className="muted">BL {blId || ''}</p>
        </div>
      </div>

      <div className="card">
        <div className="grid-2">
          <label className="label">Master
            <SearchBar placeholder="Buscar master" value={masterInput} onChange={e => setMasterInput(e.target.value)} options={mastersOptions} onSelect={(o) => { const v = o.value ?? o.label ?? String(o); setSelectedMaster(v); setMasterInput(String(o.label ?? v)); setDoInput(''); setSelectedDo('') }} fullWidth />
          </label>
          {selectedMaster && (
            <label className="label">Hijo (DO)
              <SearchBar placeholder="Seleccionar hijo" value={doInput} onChange={e => setDoInput(e.target.value)} options={childrenOptions} onSelect={(o) => { const v = o.value ?? o.label ?? String(o); setSelectedDo(v); setDoInput(String(o.label ?? v)) }} fullWidth />
            </label>
          )}
        </div>
        {selectedMaster && (
          childrenRows.length === 0 ? (
            <p className="muted" style={{ marginTop: '12px' }}>No hay hijos para este master.</p>
          ) : (
            <div className="table-responsive" style={{ marginTop: '12px' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Número BL</th>
                    <th>Nombre Cliente - NIT</th>
                    <th>Número IE</th>
                    <th>Descripción de la mercancía</th>
                    <th>Número de pedido</th>
                    <th>Fotografías</th>
                    <th>Estado</th>
                    <th className="table-actions">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {childrenRows.map(row => (
                    <tr key={row.numeroBL}>
                      <td>{row.numeroBL}</td>
                      <td>{row.clienteNombre} - {row.clienteNit}</td>
                      <td>{row.numeroIE}</td>
                      <td>{row.descripcionMercancia}</td>
                      <td>{row.numeroPedido}</td>
                      <td>{mineMap[row.numeroBL]?.photos_count || 0}</td>
                      <td>{(mineMap[row.numeroBL]?.photos_count || 0) > 0 ? <StatusBadge status={mineMap[row.numeroBL]?.send_status || ''} /> : ''}</td>
                      <td className="table-actions">
                        <button className="btn btn-outline btn-small" onClick={() => navigate('/evidence/' + row.numeroBL)}>Ingresar imágenes</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </>
  )
}

export default BLDetail