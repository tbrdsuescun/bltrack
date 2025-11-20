import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
  
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem('tbMastersCache') || '{}')
      const arr = Array.isArray(v.data) ? v.data : []
      setMastersRaw(arr)
    } catch {
      setMastersRaw([])
    }
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
    const ids = mastersMap[selectedMaster] || []
    return ids.map((id, idx) => ({
      numeroBL: id,
      clienteNombre: 'Cliente ' + String(idx + 1).padStart(2, '0'),
      clienteNit: '900' + String(100000 + idx),
      numeroIE: 'IE-' + String(1000 + idx),
      descripcionMercancia: 'Descripción de mercancía ' + (idx + 1),
      numeroPedido: 'PED-' + String(5000 + idx)
    }))
  }, [selectedMaster, mastersMap])

  async function onUpload(e) {
    const files = Array.from(e.target.files || [])
    const targetId = selectedMaster || blId
    if (!files.length || !targetId) return
    const previews = files.map((f, i) => ({ id: 'local-' + Date.now() + '-' + i, filename: f.name, url: URL.createObjectURL(f) }))
    if (selectedDo) {
      setChildPhotos(prev => ({ ...prev, [selectedDo]: (prev[selectedDo] || []).concat(previews) }))
    } else {
      setPhotos(prev => prev.concat(previews))
    }
    const fd = new FormData()
    files.forEach(f => fd.append('photos', f))
    setLoading(true)
    try {
      const res = await API.post('/bls/' + targetId + '/photos', fd)
      const newPhotos = res.data.photos || []
      if (selectedDo) {
        setChildPhotos(prev => ({ ...prev, [selectedDo]: (prev[selectedDo] || []).concat(newPhotos) }))
      } else {
        setPhotos(prev => prev.concat(newPhotos))
      }
      setStatus('Fotos cargadas: ' + newPhotos.length)
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
            <SearchBar placeholder="Buscar master" value={masterInput} onChange={e => setMasterInput(e.target.value)} options={mastersOptions} onSelect={(o) => { const v = o.value ?? o.label ?? String(o); setSelectedMaster(v); setMasterInput(String(o.label ?? v)); setDoInput(''); setSelectedDo('') }} />
          </label>
          {selectedMaster && (
            <label className="label">Hijo (DO)
              <SearchBar placeholder="Seleccionar hijo" value={doInput} onChange={e => setDoInput(e.target.value)} options={childrenOptions} onSelect={(o) => { const v = o.value ?? o.label ?? String(o); setSelectedDo(v); setDoInput(String(o.label ?? v)) }} />
            </label>
          )}
        </div>
        {selectedMaster && (
          <div className="table-responsive" style={{ marginTop: '12px' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Número BL</th>
                  <th>Nombre Cliente - NIT</th>
                  <th>Número IE</th>
                  <th>Descripción de la mercancía</th>
                  <th>Número de pedido</th>
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
                    <td className="table-actions">
                      <button className="btn btn-outline btn-small" onClick={() => navigate('/evidence/' + row.numeroBL)}>Ingresar imágenes</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

export default BLDetail