import React, { useState, useRef, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import API from '../lib/api.js'
import Layout from '../components/Layout.jsx'

function BLDetail({ user }) {
  const { blId } = useParams()
  const [photos, setPhotos] = useState([])
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef()
  
  async function onUpload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length || !blId) return
    const fd = new FormData()
    files.forEach(f => fd.append('photos', f))
    setLoading(true)
    try {
      const res = await API.post('/bls/' + blId + '/photos', fd)
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
    if (!blId) return
    setLoading(true)
    try {
      const res = await API.post('/bls/' + blId + '/send', {})
      setStatus('Enviado: ' + (res.data.status || 'ok'))
    } catch (err) {
      setStatus('Error al enviar: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
    }
  }

  function openFileDialog(){ fileInputRef.current?.click() }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="h1">Nuevo Registro Fotográfico</h1>
          <p className="muted">BL {blId || ''}</p>
        </div>
      </div>

      <div className="card">
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
          <div className="dropzone" onClick={openFileDialog}>Arrastra y suelta archivos aquí<br/>o haz clic para buscar</div>
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