import { useEffect, useMemo, useState } from 'react'
import { api, getApiBase, setApiBase } from './api'

function useUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api('/users')
      setUsers(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const create = async (payload) => {
    const u = await api('/users', { method: 'POST', body: JSON.stringify(payload) })
    setUsers((prev) => [...prev, u])
  }

  const update = async (id, payload) => {
    const u = await api(`/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
    setUsers((prev) => prev.map((x) => (x.id === id ? u : x)))
  }

  const remove = async (id) => {
    await api(`/users/${id}`, { method: 'DELETE' })
    setUsers((prev) => prev.filter((x) => x.id !== id))
  }

  return { users, loading, error, load, create, update, remove }
}

function Row({ user, users, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({ name: '', email: '' })

  useEffect(() => {
    setName(user.name)
    setEmail(user.email)
  }, [user])

  const onSave = async () => {
    const newErrors = { name: '', email: '' }
    const n = name.trim()
    const m = email.trim()
    if (!n) newErrors.name = 'Nombre requerido'
    if (!/.+@.+\..+/.test(m)) newErrors.email = 'Email inválido'
    setErrors(newErrors)
    if (newErrors.name || newErrors.email) return
    // unique email client-side check against other users
    const dup = users.some((u) => u.id !== user.id && u.email.toLowerCase() === m.toLowerCase())
    if (dup) {
      setErrors({ ...newErrors, email: 'Email ya registrado' })
      return
    }
    setSaving(true)
    try {
      await onUpdate(user.id, { name: n, email: m })
      setEditing(false)
    } catch (e) {
      // Error shown by parent via toast
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr>
      <td>{user.id}</td>
      <td>
        {editing ? (
          <div className="field-with-error">
            <input className="row-edit-input" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
            {errors.name && <small className="field-error">{errors.name}</small>}
          </div>
        ) : (
          <span>{user.name}</span>
        )}
      </td>
      <td>
        {editing ? (
          <div className="field-with-error">
            <input className="row-edit-input" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} />
            {errors.email && <small className="field-error">{errors.email}</small>}
          </div>
        ) : (
          <span>{user.email}</span>
        )}
      </td>
      <td className="row-actions">
        {editing ? (
          <>
            <button onClick={onSave} disabled={saving}>Guardar</button>
            <button className="secondary" onClick={() => setEditing(false)} disabled={saving}>Cancelar</button>
          </>
        ) : (
          <>
            <button className="secondary" onClick={() => setEditing(true)}>Editar</button>
            <button className="danger" onClick={() => onDelete(user.id)}>Eliminar</button>
          </>
        )}
      </td>
    </tr>
  )
}

export default function App() {
  const { users, loading, error, load, create, update, remove } = useUsers()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [creating, setCreating] = useState(false)
  const [formErrors, setFormErrors] = useState({ name: '', email: '' })

  // Search
  const [query, setQuery] = useState('')
  const [qDebounced, setQDebounced] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(query.trim().toLowerCase()), 250)
    return () => clearTimeout(id)
  }, [query])
  const filtered = useMemo(() => {
    if (!qDebounced) return users
    return users.filter((u) =>
      String(u.name || '').toLowerCase().includes(qDebounced) ||
      String(u.email || '').toLowerCase().includes(qDebounced)
    )
  }, [users, qDebounced])

  const [apiBase, setApiBaseState] = useState(getApiBase())
  const apiLabel = useMemo(() => apiBase, [apiBase])

  // Simple toast system
  const [toasts, setToasts] = useState([])
  const notify = (message, type = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }

  useEffect(() => { load() }, [])

  const onCreate = async (e) => {
    e.preventDefault()
    const n = name.trim()
    const m = email.trim()
    const errs = { name: '', email: '' }
    if (!n) errs.name = 'Nombre requerido'
    if (!/.+@.+\..+/.test(m)) errs.email = 'Email inválido'
    // unique email client-side check
    if (!errs.email && users.some((u) => u.email.toLowerCase() === m.toLowerCase())) errs.email = 'Email ya registrado'
    setFormErrors(errs)
    if (errs.name || errs.email) return
    setCreating(true)
    try {
      await create({ name: n, email: m })
      setName('')
      setEmail('')
      setFormErrors({ name: '', email: '' })
      notify('Usuario creado', 'success')
    } catch (e) {
      notify('Error creando: ' + e.message, 'error')
    } finally {
      setCreating(false)
    }
  }

  const onDelete = async (id) => {
    if (!confirm(`Eliminar usuario #${id}?`)) return
    try {
      await remove(id)
      notify('Usuario eliminado', 'success')
    } catch (e) {
      notify('Error eliminando: ' + e.message, 'error')
    }
  }

  const updateWithNotify = async (id, payload) => {
    try {
      await update(id, payload)
      notify('Usuario actualizado', 'success')
    } catch (e) {
      notify('Error actualizando: ' + e.message, 'error')
      throw e
    }
  }

  const onSaveBase = () => {
    try {
      const u = new URL(apiBase)
      if (!u.protocol.startsWith('http')) throw new Error('')
      setApiBase(apiBase)
      setApiBaseState(apiBase)
      alert('API Base guardada')
    } catch {
      alert('URL inválida')
    }
  }

  return (
    <div className="container">
      <header>
        <h1>Users React</h1>
        <div className="api-config">
          <label htmlFor="apiBase">API Base URL</label>
          <input id="apiBase" value={apiBase} onChange={(e) => setApiBaseState(e.target.value)} />
          <button onClick={onSaveBase}>Guardar</button>
        </div>
      </header>

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
        ))}
      </div>

      <main>
        <section className="card">
          <h2>Crear usuario</h2>
          <form onSubmit={onCreate} className="grid-form">
            <div className="form-row">
              <label htmlFor="name">Nombre</label>
              <input id="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!formErrors.name} />
              {formErrors.name && <small className="field-error">{formErrors.name}</small>}
            </div>
            <div className="form-row">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!formErrors.email} />
              {formErrors.email && <small className="field-error">{formErrors.email}</small>}
            </div>
            <button type="submit" disabled={creating}>{creating ? 'Creando...' : 'Crear'}</button>
          </form>
        </section>

        <section className="card">
          <div className="list-header">
            <h2>Usuarios</h2>
            <div className="right">
              <small>API: {apiLabel}</small>
              <button onClick={load} disabled={loading}>{loading ? 'Cargando...' : 'Actualizar'}</button>
            </div>
          </div>
          <div className="list-tools">
            <input
              className="search-input"
              placeholder="Buscar por nombre o email..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <small className="muted">{filtered.length} resultado(s)</small>
          </div>
          {error && <div className="list-status error">Error: {error}</div>}
          {loading && <div className="list-status">Cargando...</div>}
          <table id="usersTable">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nombre</th>
                <th>Email</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={4}><div className="empty-state">No hay usuarios todavía. Crea el primero ✨</div></td></tr>
              ) : (
                filtered.map((u) => (
                  <Row key={u.id} user={u} users={users} onUpdate={updateWithNotify} onDelete={onDelete} />
                ))
              )}
            </tbody>
          </table>
        </section>
      </main>

      <footer>
        <small>users-react · conectado a users-api</small>
      </footer>
    </div>
  )
}
