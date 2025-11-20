import React, { useState, useEffect } from 'react'
import axios from 'axios'
import Layout from '../components/Layout.jsx'
import SearchBar from '../components/SearchBar.jsx'
import API from '../lib/api.js'

function AdminUsers({ user }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ nombre: '', email: '', password: '', role: 'operario', puerto: 'Barranquilla', is_active: true })
  const [editing, setEditing] = useState(null)
  const [msg, setMsg] = useState(null)
  const [query, setQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showPass, setShowPass] = useState(false)

  // Usar API compartida sin interceptores locales

  async function load() {
    setLoading(true)
    try {
      const res = await API.get('/users')
      setItems(res.data.items || [])
    } catch (err) {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function onChangeField(k, v) { setForm(prev => ({ ...prev, [k]: v })) }

  async function onCreate(e) {
    e.preventDefault()
    setLoading(true)
    setMsg(null)
    try {
      const res = await API.post('/users', form)
      setMsg('Usuario creado: ' + res.data.email)
      setForm({ nombre: '', email: '', password: '', role: 'operario', puerto: 'Barranquilla', is_active: true })
      setShowModal(false)
      await load()
    } catch (err) {
      setMsg('Error al crear: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
    }
  }

  function startEdit(item) {
    setEditing(item.id)
    setForm({ nombre: item.nombre || '', email: item.email || '', password: '', role: item.role || 'operario', puerto: item.puerto || 'Barranquilla', is_active: !!item.is_active })
    setShowModal(true)
  }

  async function onUpdate(e) {
    e.preventDefault()
    if (!editing) return
    setLoading(true)
    setMsg(null)
    try {
      
      const payload = { nombre: form.nombre, email: form.email, role: form.role, puerto: form.puerto, is_active: form.is_active }
      if (form.password) payload.password = form.password
      await API.patch('/users/' + editing, payload)
      setMsg('Usuario actualizado')
      setEditing(null)
      setForm({ nombre: '', email: '', password: '', role: 'operario', puerto: 'Barranquilla', is_active: true })
      setShowModal(false)
      await load()
    } catch (err) {
      setMsg('Error al actualizar: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
    }
  }

  const [confirmUser, setConfirmUser] = useState(null)
  async function onDeleteConfirmed() {
    if (!confirmUser) { setConfirmUser(null); return }
    setLoading(true)
    setMsg(null)
    try {
      await API.delete('/users/' + confirmUser.id)
      setMsg('Usuario eliminado')
      await load()
    } catch (err) {
      setMsg('Error al eliminar: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
      setConfirmUser(null)
    }
  }

  async function onDeactivate(id) {
    setLoading(true)
    setMsg(null)
    try {
      await API.patch('/users/' + id + '/deactivate', {})
      setMsg('Usuario desactivado')
      await load()
    } catch (err) {
      setMsg('Error al desactivar: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
    }
  }

  const filtered = items.filter(it => !query || (it.nombre || '').toLowerCase().includes(query.toLowerCase()) || (it.email || '').toLowerCase().includes(query.toLowerCase()))
  const [page, setPage] = useState(1)
  const pageSize = 5

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="h1">Gestión de Usuarios</h1>
          <p className="muted">Administra, actualiza y elimina perfiles de usuario.</p>
        </div>
        <div className="actions-row">
          <button className="btn btn-primary" onClick={() => { setEditing(null); setForm({ nombre: '', email: '', password: '', role: 'operario', puerto: 'Barranquilla', is_active: true }); setShowModal(true); }}>+ Crear Nuevo Usuario</button>
        </div>
      </div>

      <div className="card">
        {msg && <p className="muted">{msg}</p>}
        <div className="searchbar">
          <SearchBar placeholder="Buscar usuario por nombre o correo" value={query} onChange={e => setQuery(e.target.value)} />
        </div>

        <div className="table-responsive" style={{ marginTop: '10px' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Nombre completo</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Puerto</th>
                <th className="table-actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize).map(it => (
                <tr key={it.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{(it.nombre || '?').slice(0, 1).toUpperCase()}</div>
                      <div>
                        <div>{it.nombre || '(sin nombre)'}</div>
                        <div className="muted" style={{ fontSize: '12px' }}>{it.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {(it.role === 'admin') ? <span className="badge badge-accent">Admin</span> : <span className="badge badge-accent">Operario</span>}
                  </td>
                  <td>
                    {it.is_active ? (
                      <span className="badge badge-green"><span className="badge-dot green" /> Activo</span>
                    ) : (
                      <span className="badge badge-red"><span className="badge-dot red" /> Inactivo</span>
                    )}
                  </td>
                  <td>
                    {it.puerto || '-'}
                  </td>
                  <td className="table-actions">
                    <button className="btn btn-outline btn-small" onClick={() => startEdit(it)} disabled={loading}>Actualizar</button>
                    {' '}
                    <button className="btn btn-danger btn-small" onClick={() => setConfirmUser(it)} disabled={loading}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <span className="muted">Mostrando {filtered.length ? ((page - 1) * pageSize + 1) : 0}-{Math.min(page * pageSize, filtered.length)} de {filtered.length} resultados</span>
          <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>{'<'}</button>
          {Array.from({ length: Math.max(1, Math.ceil(filtered.length / pageSize)) }, (_, i) => (
            <button key={i} className={'page-btn' + (page === i + 1 ? ' active' : '')} onClick={() => setPage(i + 1)}>{i + 1}</button>
          ))}
          <button className="page-btn" disabled={page >= Math.max(1, Math.ceil(filtered.length / pageSize))} onClick={() => setPage(p => Math.min(Math.max(1, Math.ceil(filtered.length / pageSize)), p + 1))}>{'>'}</button>
        </div>
      </div>

      {showModal && (
        <div className="modal-backdrop" onClick={() => { setShowModal(false); setEditing(null) }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Gestionar Usuario</span>
              <button type="button" className="btn btn-outline btn-small" style={{ fontSize: '1.5rem' }} onClick={() => { setShowModal(false); setEditing(null) }}>×</button>
            </div>
            <form onSubmit={editing ? onUpdate : onCreate}>
              <div className="modal-body">
                <div className="grid-2">
                  <label className="label">
                    Nombre
                    <input className="input" type="text" placeholder="Ingrese el nombre" value={form.nombre} onChange={(e) => onChangeField('nombre', e.target.value)} />
                  </label>
                  <label className="label">
                    Email
                    <input className="input" type="email" placeholder="usuario@ejemplo.com" value={form.email} onChange={(e) => onChangeField('email', e.target.value)} />
                  </label>
                </div>
                <div className="grid-2">
                  <label className="label" style={{ position: 'relative' }}>
                    Contraseña
                    <input className="input" type={showPass ? 'text' : 'password'} placeholder="Dejar en blanco para no cambiar" value={form.password} onChange={(e) => onChangeField('password', e.target.value)} />
                    <button type="button" className="btn btn-outline btn-small" style={{ position: 'absolute', right: 8, top: 34 }} onClick={() => setShowPass(s => !s)}>{showPass ? 'Ocultar' : 'Ver'}</button>
                  </label>
                  <label className="label">
                    Puerto
                    <select className="input" value={form.puerto} onChange={(e) => onChangeField('puerto', e.target.value)}>
                      <option value="Barranquilla">Barranquilla</option>
                      <option value="Cartagena">Cartagena</option>
                      <option value="Buenaventura">Buenaventura</option>
                      <option value="Santa Marta">Santa Marta</option>
                    </select>
                  </label>
                </div>
                <div className="grid-2">
                  <label className="label">
                    Rol
                    <select className="input" value={form.role} onChange={(e) => onChangeField('role', e.target.value)}>
                      <option value="operario">Operario</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                  <div className="label">
                    Estado
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                      <span className={form.is_active ? 'muted' : 'badge badge-red'} style={{ cursor: 'pointer' }} onClick={() => onChangeField('is_active', false)}>Inactivo</span>
                      <span className={form.is_active ? 'badge badge-accent' : 'muted'} style={{ cursor: 'pointer' }} onClick={() => onChangeField('is_active', true)}>Activo</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn" onClick={() => { setShowModal(false); setEditing(null) }}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmUser && (
        <div className="modal-backdrop" onClick={() => setConfirmUser(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Confirmar eliminación</span>
              <button type="button" className="btn btn-outline btn-small" style={{ fontSize: '1.5rem' }} onClick={() => setConfirmUser(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div>
                  <div>¿Eliminar a <strong>{confirmUser?.nombre || confirmUser?.email}</strong>?</div>
                  <div className="muted" style={{ fontSize:12 }}>Esta acción no se puede deshacer.</div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setConfirmUser(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={onDeleteConfirmed} disabled={loading}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default AdminUsers