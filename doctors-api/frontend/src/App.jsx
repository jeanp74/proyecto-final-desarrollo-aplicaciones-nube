import { useEffect, useMemo, useState } from "react";
import { api, getApiBase, setApiBase } from "./api";

/* ======= catálogo de especialidades (ajústalo a tu gusto) ======= */
const ESPECIALIDADES = [
  "General",
  "Pediatría",
  "Cardiología",
  "Dermatología",
  "Ginecología",
  "Odontología",
  "Oftalmología",
  "Ortopedia",
  "Neurología",
  "Psicología",
];

/* ========== Data hook ========== */
function useDoctors() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const data = await api("/doctors");
      setItems(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const create = async (payload) => {
    const d = await api("/doctors", { method: "POST", body: JSON.stringify(payload) });
    setItems((prev) => [...prev, d]);
  };

  const update = async (id, payload) => {
    const d = await api(`/doctors/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    setItems((prev) => prev.map((x) => (x.id === id ? d : x)));
  };

  const remove = async (id) => {
    await api(`/doctors/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  return { items, loading, error, load, create, update, remove };
}

/* ========== Row editable ========== */
function Row({ item, all, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(item);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => setForm(item), [item]);

  const set = (k) => (e) =>
    setForm((s) => ({ ...s, [k]: k === "activo" ? e.target.checked : e.target.value }));

  const onSave = async () => {
    const f = {
      nombre_completo: (form.nombre_completo || "").trim(),
      especialidad: (form.especialidad || "").trim(),
      correo: (form.correo || "").trim(),
      telefono: (form.telefono || "").trim(),
      activo: !!form.activo,
    };
    const e = {};
    if (!f.nombre_completo) e.nombre_completo = "Requerido";
    if (!f.especialidad) e.especialidad = "Requerido";
    if (f.correo && !/.+@.+\..+/.test(f.correo)) e.correo = "Email inválido";
    const dupMail =
      f.correo &&
      all.some((x) => x.id !== item.id && (x.correo || "").toLowerCase() === f.correo.toLowerCase());
    if (!e.correo && dupMail) e.correo = "Correo ya registrado";

    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      await onUpdate(item.id, f);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr>
      <td className="mono w-min">{item.id}</td>

      <td>
        {editing ? (
          <>
            <input className="row-edit-input" value={form.nombre_completo || ""} onChange={set("nombre_completo")} aria-invalid={!!errors.nombre_completo} />
            {errors.nombre_completo && <small className="field-error">{errors.nombre_completo}</small>}
          </>
        ) : (
          <div className="cell-title">{item.nombre_completo}</div>
        )}
      </td>

      <td>
        {editing ? (
          <>
            <div className="pretty-select compact">
              <select value={form.especialidad || ""} onChange={set("especialidad")} aria-invalid={!!errors.especialidad}>
                <option value="">Seleccione especialidad</option>
                {ESPECIALIDADES.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            {errors.especialidad && <small className="field-error">{errors.especialidad}</small>}
          </>
        ) : (
          item.especialidad
        )}
      </td>

      <td>
        {editing ? (
          <>
            <input className="row-edit-input" value={form.correo || ""} onChange={set("correo")} aria-invalid={!!errors.correo} />
            {errors.correo && <small className="field-error">{errors.correo}</small>}
          </>
        ) : (
          <div className="cell-sub">{item.correo || "—"}</div>
        )}
      </td>

      <td>{editing ? <input className="row-edit-input" value={form.telefono || ""} onChange={set("telefono")} /> : (item.telefono || "—")}</td>

      <td className="center">
        {editing ? <input type="checkbox" checked={!!form.activo} onChange={set("activo")} /> : (item.activo ? "Sí" : "No")}
      </td>

      <td className="row-actions w-min">
        {editing ? (
          <>
            <button onClick={onSave} disabled={saving}>Guardar</button>
            <button className="secondary" onClick={() => setEditing(false)} disabled={saving}>Cancelar</button>
          </>
        ) : (
          <>
            <button className="secondary" onClick={() => setEditing(true)}>Editar</button>
            <button className="danger" onClick={() => onDelete(item.id)}>Eliminar</button>
          </>
        )}
      </td>
    </tr>
  );
}

/* ========== App ========== */
export default function App() {
  const { items, loading, error, load, create, update, remove } = useDoctors();
  const [apiBase, setApiBaseState] = useState(getApiBase());
  const [query, setQuery] = useState("");
  const [qDeb, setQDeb] = useState("");
  useEffect(() => { const t = setTimeout(() => setQDeb(query.trim().toLowerCase()), 250); return () => clearTimeout(t); }, [query]);
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!qDeb) return items;
    return items.filter((d) =>
      [d.nombre_completo, d.especialidad, d.correo, d.telefono]
        .some((v) => String(v || "").toLowerCase().includes(qDeb))
    );
  }, [items, qDeb]);

  const [form, setForm] = useState({ nombre_completo: "", especialidad: "", correo: "", telefono: "", activo: true });
  const [creating, setCreating] = useState(false);
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: k === "activo" ? e.target.checked : e.target.value }));

  const onSaveBase = () => {
    try {
      const u = new URL(apiBase, window.location.origin);
      if (!u.protocol.startsWith("http")) throw new Error();
      setApiBase(apiBase);
      alert("API Base guardada");
    } catch { alert("URL inválida"); }
  };

  const onCreate = async (e) => {
    e.preventDefault();
    const f = {
      nombre_completo: form.nombre_completo.trim(),
      especialidad: form.especialidad.trim(),
      correo: form.correo.trim(),
      telefono: form.telefono.trim() || undefined,
      activo: !!form.activo,
    };
    const er = {};
    if (!f.nombre_completo) er.nombre_completo = "Requerido";
    if (!f.especialidad) er.especialidad = "Requerido";
    if (f.correo && !/.+@.+\..+/.test(f.correo)) er.correo = "Email inválido";
    if (f.correo && items.some((x) => (x.correo || "").toLowerCase() === f.correo.toLowerCase())) er.correo = "Correo ya registrado";
    setErrors(er);
    if (Object.keys(er).length) return;

    setCreating(true);
    try {
      await create(f);
      setForm({ nombre_completo: "", especialidad: "", correo: "", telefono: "", activo: true });
      setErrors({});
    } catch (e) {
      alert("Error creando: " + e.message);
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id) => {
    if (!confirm(`Eliminar médico #${id}?`)) return;
    try {
      await remove(id);
    } catch (e) {
      alert("Error eliminando: " + e.message);
    }
  };

  return (
    <div className="container">
      <header>
        <h1>Médicos</h1>
        <div className="api-config">
          <label htmlFor="apiBase">API Base</label>
          <input id="apiBase" value={apiBase} onChange={(e) => setApiBaseState(e.target.value)} placeholder="/" />
          <button onClick={onSaveBase}>Guardar</button>
        </div>
      </header>

      <main>
        <section className="card">
          <h2>Registrar médico</h2>
          <form onSubmit={onCreate} className="grid-form">
            <div className="form-row">
              <label>Nombre completo</label>
              <input value={form.nombre_completo} onChange={set("nombre_completo")} aria-invalid={!!errors.nombre_completo} />
              {errors.nombre_completo && <small className="field-error">{errors.nombre_completo}</small>}
            </div>

            <div className="form-row">
              <label>Especialidad</label>
              <div className="pretty-select">
                <select value={form.especialidad} onChange={set("especialidad")} aria-invalid={!!errors.especialidad}>
                  <option value="">Seleccione una especialidad</option>
                  {ESPECIALIDADES.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              {errors.especialidad && <small className="field-error">{errors.especialidad}</small>}
            </div>

            <div className="form-row">
              <label>Correo</label>
              <input type="email" value={form.correo} onChange={set("correo")} aria-invalid={!!errors.correo} />
              {errors.correo && <small className="field-error">{errors.correo}</small>}
            </div>

            <div className="form-row">
              <label>Teléfono</label>
              <input value={form.telefono} onChange={set("telefono")} />
            </div>

            <div className="form-row">
              <label>Activo</label>
              <input type="checkbox" checked={!!form.activo} onChange={set("activo")} />
            </div>

            <button type="submit" disabled={creating}>{creating ? "Creando..." : "Crear"}</button>
          </form>
        </section>

        <section className="card">
          <div className="list-header">
            <h2>Listado</h2>
            <div className="right">
              <small>Registros: {filtered.length}</small>
              <button onClick={load} disabled={loading}>{loading ? "Cargando..." : "Actualizar"}</button>
            </div>
          </div>

          <div className="list-tools">
            <input
              className="search-input"
              placeholder="Buscar por nombre, especialidad, correo..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {error && <div className="list-status error">Error: {error}</div>}

          <table className="table">
            <thead>
              <tr>
                <th className="w-min">ID</th>
                <th>Nombre completo</th>
                <th>Especialidad</th>
                <th>Correo</th>
                <th>Teléfono</th>
                <th className="w-min">Activo</th>
                <th className="w-min">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7}><div className="empty-state">Sin médicos.</div></td></tr>
              ) : (
                filtered.map((d) => (
                  <Row key={d.id} item={d} all={items} onUpdate={update} onDelete={onDelete} />
                ))
              )}
            </tbody>
          </table>
        </section>
      </main>

      <footer><small>doctors-react · conectado a doctors-api</small></footer>
    </div>
  );
}
