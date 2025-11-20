import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import API from '../lib/api.js'
import Layout from '../components/Layout.jsx'
import SearchBar from '../components/SearchBar.jsx'

function BLDetail({ user }) {
  const { blId } = useParams()
  const [photos, setPhotos] = useState([])
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef()
  const [mastersRaw, setMastersRaw] = useState([])
  const [masterInput, setMasterInput] = useState('')
  const [selectedMaster, setSelectedMaster] = useState('')
  const [doInput, setDoInput] = useState('')
  const [selectedDo, setSelectedDo] = useState('')
  
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

  async function onUpload(e) {
    const files = Array.from(e.target.files || [])
    const targetId = selectedMaster || blId
    if (!files.length || !targetId) return
    const fd = new FormData()
    files.forEach(f => fd.append('photos', f))
    setLoading(true)
    try {
      const res = await API.post('/bls/' + targetId + '/photos', fd)
      const newPhotos = res.data.photos || []
      setPhotos(prev => prev.concat(newPhotos))
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
        <div>
          <h2 className="h2">Detalles del Registro</h2>
          <div className="grid-2">
            <div>
              <label className="label">Proyecto
                <input className="input" placeholder="Buscar y seleccionar un proyecto" />
              </label>
            </div>
            <div>
              <label className="label">Tipo de Registro
                <select className="input">
                  <option value="">Seleccionar tipo</option>
                  <option value="general">General</option>
                </select>
              </label>
            </div>
          </div>
        </div>

        <div style={{ marginTop:'12px' }}>
          <h2 className="h2">Evidencia Fotográfica</h2>
          <div className="dropzone" onClick={openFileDialog} onDrop={onDrop} onDragOver={onDragOver}>Arrastra y suelta archivos aquí<br/>o haz clic para buscar</div>
          <div className="actions" style={{ justifyContent:'flex-start' }}>
            <button className="btn btn-primary" onClick={openFileDialog}>Subir Archivo</button>
            <button className="btn btn-outline" onClick={openFileDialog}>Tomar Foto</button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" style={{ display:'none' }} onChange={onUpload} disabled={loading} />
        </div>

        {status && <p className="muted">{status}</p>}

        <div className="preview-grid">
          {photos.map(p => (
            <div key={p.id} className="preview-card">
              {p.url ? <img src={p.url} alt={p.filename || p.id} /> : <div style={{ padding:'12px' }}>{p.filename || p.id}</div>}
            </div>
          ))}
        </div>

        <div className="actions" style={{ justifyContent:'flex-end' }}>
          <button className="btn btn-outline" disabled={loading}>Guardar</button>
          <button className="btn btn-primary" onClick={onSend} disabled={loading}>Enviar</button>
        </div>
      </div>
    </>
  )
}

export default BLDetail