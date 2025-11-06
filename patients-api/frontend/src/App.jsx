import { useEffect, useMemo, useState } from 'react'
import { api, getApiBase, setApiBase } from './api'

function usePatients() {
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true); setError('')
    try {
      const data = await api('/patients')
      setPatients(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const create = async (payload) => {
    const p = await api('/patients', { method: 'POST', body: JSON.stringify(payload) })
    setPatients((prev) => [...prev, p])
  }

  const update = async (id, payload) => {
    const p = await api(`/patients/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
    setPatients((prev) => prev.map((x) => (x.id === id ? p : x)))
  }

  const remove = async (id) => {
    await api(`/patients/${id}`, { method: 'DELETE' })
    setPatients((prev) => prev.filter((x) => x.id !== id))
  }

  return { patients, loading, error, load, create, update, remove }
}

function Row({ patient, patients, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(patient)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => setForm(patient), [patient])

  const onSave = async () => {
    const e = {}
    const f = {
      nombres: (form.nombres || '').trim(),
      apellidos: (form.apellidos || '').trim(),
      documento: (form.documento || '').trim(),
      correo: (form.correo || '').trim(),
      telefono: (form.telefono || '').trim(),
      fecha_nacimiento: form.fecha_nacimiento || null,
      genero: (form.genero || '').trim()
    }
    if (!f.nombres) e.nombres = 'Requerido'
    if (!f.apellidos) e.apellidos = 'Requerido'
    if (!f.documento) e.documento = 'Requerido'
    if (!/.+@.+\..+/.test(f.correo)) e.correo = 'Email inválido'
    // unicidad “client-side” básica
    const dupDoc = patients.some((p) => p.id !== patient.id && (p.documento || '').toLowerCase() === f.documento.toLowerCase())
    if (!e.documento && dupDoc) e.documento = 'Documento ya registrado'
    const dupMail = patients.some((p) => p.id !== patient.id && (p.correo || '').toLowerCase() === f.correo.toLowerCase())
    if (!e.correo && dupMail) e.correo = 'Correo ya registrado'
    setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true)
    try {
      await onUpdate(patient.id, f)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const set = (k) => (ev) => setForm((s) => ({ ...s, [k]: ev.target.value }))

  return (
    <tr>
      <td>{patient.id}</td>
      <td>{editing ? <input className="row-edit-input" value={form.nombres||''} onChange={set('nombres')} aria-invalid={!!errors.nombres}/> : patient.nombres}</td>
      <td>{editing ? <input className="row-edit-input" value={form.apellidos||''} onChange={set('apellidos')} aria-invalid={!!errors.apellidos}/> : patient.apellidos}</td>
      <td>{editing ? <input className="row-edit-input" value={form.documento||''} onChange={set('documento')} aria-invalid={!!errors.documento}/> : patient.documento}</td>
      <td>{editing ? <input className="row-edit-input" value={form.correo||''} onChange={set('correo')} aria-invalid={!!errors.correo}/> : patient.correo}</td>
      <td>{editing ? <input className="row-edit-input" value={form.telefono||''} onChange={set('telefono')}/> : (patient.telefono||'')}</td>
      <td>{editing ? <input className="row-edit-input" type="date" value={form.fecha_nacimiento||''} onChange={set('fecha_nacimiento')}/> : (patient.fecha_nacimiento||'')}</td>
      <td>{editing ? <input className="row-edit-input" value={form.genero||''} onChange={set('genero')}/> : (patient.genero||'')}</td>
      <td className="row-actions">
        {editing ? (
          <>
            <button onClick={onSave} disabled={saving}>Guardar</button>
            <button className="secondary" onClick={() => setEditing(false)} disabled={saving}>Cancelar</button>
          </>
        ) : (
          <>
            <button className="secondary" onClick={() => setEditing(true)}>Editar</button>
            <button className="danger" onClick={() => onDelete(patient.id)}>Eliminar</button>
          </>
        )}
      </td>
    </tr>
  )
}

export default function App() {
  const { patients, loading, error, load, create, update, remove } = usePatients()

  const [form, setForm] = useState({
    nombres: '', apellidos: '', documento: '', correo: '',
    telefono: '', fecha_nacimiento: '', genero: ''
  })
  const [creating, setCreating] = useState(false)
  const [formErrors, setFormErrors] = useState({})

  const [query, setQuery] = useState('')
  const [qDebounced, setQDebounced] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(query.trim().toLowerCase()), 250)
    return () => clearTimeout(id)
  }, [query])

  const filtered = useMemo(() => {
    if (!qDebounced) return patients
    return patients.filter((p) =>
      [p.nombres, p.apellidos, p.documento, p.correo, p.telefono]
      .some((v) => String(v||'').toLowerCase().includes(qDebounced))
    )
  }, [patients, qDebounced])

  const [apiBase, setApiBaseState] = useState(getApiBase())
  useEffect(() => { load() }, [])

  const onCreate = async (e) => {
    e.preventDefault()
    const f = {
      nombres: form.nombres.trim(),
      apellidos: form.apellidos.trim(),
      documento: form.documento.trim(),
      correo: form.correo.trim(),
      telefono: form.telefono.trim() || undefined,
      fecha_nacimiento: form.fecha_nacimiento || undefined,
      genero: form.genero.trim() || undefined
    }
    const e2 = {}
    if (!f.nombres) e2.nombres = 'Requerido'
    if (!f.apellidos) e2.apellidos = 'Requerido'
    if (!f.documento) e2.documento = 'Requerido'
    if (!/.+@.+\..+/.test(f.correo)) e2.correo = 'Email inválido'
    if (!e2.documento && patients.some((p) => (p.documento||'').toLowerCase() === f.documento.toLowerCase())) e2.documento='Documento ya registrado'
    if (!e2.correo && patients.some((p) => (p.correo||'').toLowerCase() === f.correo.toLowerCase())) e2.correo='Correo ya registrado'
    setFormErrors(e2)
    if (Object.keys(e2).length) return
    setCreating(true)
    try {
      await create(f)
      setForm({ nombres:'', apellidos:'', documento:'', correo:'', telefono:'', fecha_nacimiento:'', genero:'' })
      setFormErrors({})
      alert('Paciente creado')
    } catch (e) {
      alert('Error creando: '+e.message)
    } finally {
      setCreating(false)
    }
  }

  const onDelete = async (id) => {
    if (!confirm(`Eliminar paciente #${id}?`)) return
    try {
      await remove(id)
      alert('Paciente eliminado')
    } catch (e) {
      alert('Error eliminando: ' + e.message)
    }
  }

  const onSaveBase = () => {
    try {
      // Permite URL absoluta o "/" para mismo origen
      const u = new URL(apiBase, window.location.origin)
      if (!u.protocol.startsWith('http')) throw new Error('')
      setApiBase(apiBase)
      alert('API Base guardada')
    } catch {
      alert('URL inválida')
    }
  }

  const set = (k) => (ev) => setForm((s) => ({ ...s, [k]: ev.target.value }))

  return (
    <div className="container">
      <header>
        <h1>Pacientes</h1>
        <div className="api-config">
          <label htmlFor="apiBase">API Base</label>
          <input id="apiBase" value={apiBase} onChange={(e)=>setApiBaseState(e.target.value)} placeholder="/" />
          <button onClick={onSaveBase}>Guardar</button>
        </div>
      </header>

      <main>
        <section className="card">
          <h2>Registrar paciente</h2>
          <form onSubmit={onCreate} className="grid-form">
            <div className="form-row">
              <label>Nombres</label>
              <input value={form.nombres} onChange={set('nombres')} aria-invalid={!!formErrors.nombres}/>
              {formErrors.nombres && <small className="field-error">{formErrors.nombres}</small>}
            </div>
            <div className="form-row">
              <label>Apellidos</label>
              <input value={form.apellidos} onChange={set('apellidos')} aria-invalid={!!formErrors.apellidos}/>
              {formErrors.apellidos && <small className="field-error">{formErrors.apellidos}</small>}
            </div>
            <div className="form-row">
              <label>Documento</label>
              <input value={form.documento} onChange={set('documento')} aria-invalid={!!formErrors.documento}/>
              {formErrors.documento && <small className="field-error">{formErrors.documento}</small>}
            </div>
            <div className="form-row">
              <label>Correo</label>
              <input type="email" value={form.correo} onChange={set('correo')} aria-invalid={!!formErrors.correo}/>
              {formErrors.correo && <small className="field-error">{formErrors.correo}</small>}
            </div>
            <div className="form-row">
              <label>Teléfono</label>
              <input value={form.telefono} onChange={set('telefono')}/>
            </div>
            <div className="form-row">
              <label>Fecha de nacimiento</label>
              <input type="date" value={form.fecha_nacimiento} onChange={set('fecha_nacimiento')}/>
            </div>
            <div className="form-row">
              <label>Género</label>
              <input value={form.genero} onChange={set('genero')} placeholder="masculino/femenino/otro"/>
            </div>
            <button type="submit" disabled={creating}>{creating ? 'Creando...' : 'Crear'}</button>
          </form>
        </section>

        <section className="card">
          <div className="list-header">
            <h2>Pacientes</h2>
            <div className="right">
              <small>Registros: {filtered.length}</small>
              <button onClick={load} disabled={loading}>{loading ? 'Cargando...' : 'Actualizar'}</button>
            </div>
          </div>
          <div className="list-tools">
            <input className="search-input" placeholder="Buscar por nombre, doc, correo..." value={query} onChange={(e)=>setQuery(e.target.value)} />
          </div>
          {error && <div className="list-status error">Error: {error}</div>}
          <table id="usersTable">
            <thead>
              <tr>
                <th>ID</th><th>Nombres</th><th>Apellidos</th><th>Documento</th><th>Correo</th>
                <th>Teléfono</th><th>Nacimiento</th><th>Género</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={9}><div className="empty-state">Sin pacientes. Crea el primero ✨</div></td></tr>
                : filtered.map((p) => (
                    <Row key={p.id} patient={p} patients={patients} onUpdate={update} onDelete={onDelete}/>
                  ))
              }
            </tbody>
          </table>
        </section>
      </main>

      <footer><small>patients-react · conectado a patients-api</small></footer>
    </div>
  )
}
