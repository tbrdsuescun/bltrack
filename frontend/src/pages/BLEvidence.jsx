import React, { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import API from '../lib/api.js'
import SearchBar from '../components/SearchBar.jsx'

function BLEvidence() {
  const { id } = useParams()
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const fileInputRef = useRef()

  useEffect(() => {
    let mounted = true
    API.get('/bls/' + id + '/photos').then(res => {
      if (!mounted) return
      const list = Array.isArray(res.data?.photos) ? res.data.photos : []
      setPhotos(list)
    }).catch(() => setPhotos([]))
    return () => { mounted = false }
  }, [id])

  async function onUpload(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length || !id) return
    const localPreviews = files.map((f, i) => ({ id: 'local-' + Date.now() + '-' + i, filename: f.name, url: URL.createObjectURL(f) }))
    setPhotos(prev => prev.concat(localPreviews))
    const fd = new FormData()
    files.forEach(f => fd.append('photos', f))
    setLoading(true)
    try {
      const res = await API.post('/bls/' + id + '/photos', fd)
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
    if (!id) return
    setLoading(true)
    try {
      const res = await API.post('/bls/' + id + '/send', {})
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
          <h1 className="h1">Evidencia Fotográfica</h1>
          <p className="muted">BL {id}</p>
        </div>
      </div>

      <div className="card">
        <div style={{ marginTop:'12px' }}>
          <h2 className="h2">Evidencia</h2>
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

export default BLEvidence