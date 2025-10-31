import { useEffect, useMemo, useState } from "react";
import { api, getApiBase, setApiBase } from "./api";

/* ===== Helpers de fecha ===== */
function isoToLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d.toISOString();
}

/* ===== Hook de datos ===== */
function useAppointments() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const data = await api("/appointments");
      setItems(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const create = async (payload) => {
    const a = await api("/appointments", { method: "POST", body: JSON.stringify(payload) });
    setItems((prev) => [...prev, a].sort((x, y) => new Date(x.inicio) - new Date(y.inicio)));
  };

  const update = async (id, payload) => {
    const a = await api(`/appointments/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    setItems((prev) => prev.map((x) => (x.id === id ? a : x)).sort((x, y) => new Date(x.inicio) - new Date(y.inicio)));
  };

  const remove = async (id) => {
    await api(`/appointments/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  return { items, loading, error, load, create, update, remove };
}

/* ===== Fila editable ===== */
function Row({ item, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    paciente_id: item.paciente_id,
    medico_id: item.medico_id,
    inicio: isoToLocalInput(item.inicio),
    fin: isoToLocalInput(item.fin),
    motivo: item.motivo || "",
    estado: item.estado || "programada",
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setForm({
      paciente_id: item.paciente_id,
      medico_id: item.medico_id,
      inicio: isoToLocalInput(item.inicio),
      fin: isoToLocalInput(item.fin),
      motivo: item.motivo || "",
      estado: item.estado || "programada",
    });
  }, [item]);

  const set = (k) => (e) =>
    setForm((s) => ({ ...s, [k]: k === "paciente_id" || k === "medico_id" ? e.target.value.replace(/\D/g, "") : e.target.value }));

  const onSave = async () => {
    const f = {
      paciente_id: Number(form.paciente_id),
      medico_id: Number(form.medico_id),
      inicio: localInputToIso(form.inicio),
      fin: localInputToIso(form.fin),
      motivo: form.motivo.trim() || null,
      estado: form.estado || "programada",
    };
    const e = {};
    if (!f.paciente_id) e.paciente_id = "Requerido";
    if (!f.medico_id) e.medico_id = "Requerido";
    if (!f.inicio) e.inicio = "Requerido";
    if (!f.fin) e.fin = "Requerido";
    if (!e.inicio && !e.fin && new Date(f.fin) <= new Date(f.inicio)) e.fin = "Debe ser > inicio";
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
      <td>{item.id}</td>
      <td>{editing ? <input className="row-edit-input" value={form.paciente_id} onChange={set("paciente_id")} aria-invalid={!!errors.paciente_id}/> : item.paciente_id}</td>
      <td>{editing ? <input className="row-edit-input" value={form.medico_id} onChange={set("medico_id")} aria-invalid={!!errors.medico_id}/> : item.medico_id}</td>
      <td>{editing ? <input className="row-edit-input" type="datetime-local" value={form.inicio} onChange={set("inicio")} aria-invalid={!!errors.inicio}/> : isoToLocalInput(item.inicio)}</td>
      <td>{editing ? <input className="row-edit-input" type="datetime-local" value={form.fin} onChange={set("fin")} aria-invalid={!!errors.fin}/> : isoToLocalInput(item.fin)}</td>
      <td>{editing ? <input className="row-edit-input" value={form.motivo} onChange={set("motivo")}/> : (item.motivo || "")}</td>
      <td>
        {editing ? (
          <select className="row-edit-input" value={form.estado} onChange={set("estado")}>
            <option value="programada">programada</option>
            <option value="reprogramada">reprogramada</option>
            <option value="cancelada">cancelada</option>
            <option value="hecha">hecha</option>
          </select>
        ) : (
          item.estado
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
            <button className="danger" onClick={() => onDelete(item.id)}>Eliminar</button>
          </>
        )}
      </td>
    </tr>
  );
}

/* ===== App principal ===== */
export default function App() {
  const { items, loading, error, load, create, update, remove } = useAppointments();
  const [apiBase, setApiBaseState] = useState(getApiBase());

  const [query, setQuery] = useState({ paciente_id: "", medico_id: "", estado: "", from: "", to: "" });
  const [deb, setDeb] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDeb(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const f = (arr) => arr
      .filter((x) => !deb.paciente_id || String(x.paciente_id) === deb.paciente_id.trim())
      .filter((x) => !deb.medico_id || String(x.medico_id) === deb.medico_id.trim())
      .filter((x) => !deb.estado || String(x.estado || "").toLowerCase() === deb.estado.trim().toLowerCase())
      .filter((x) => !deb.from || new Date(x.inicio) >= new Date(deb.from))
      .filter((x) => !deb.to   || new Date(x.inicio) <  new Date(deb.to));
    return f(items);
  }, [items, deb]);

  const [form, setForm] = useState({
    paciente_id: "", medico_id: "", inicio: "", fin: "", motivo: "", estado: "programada",
  });
  const [creating, setCreating] = useState(false);
  const [errors, setErrors] = useState({});
  const setF = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

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
    const payload = {
      paciente_id: Number(form.paciente_id),
      medico_id: Number(form.medico_id),
      inicio: localInputToIso(form.inicio),
      fin: localInputToIso(form.fin),
      motivo: form.motivo.trim() || null,
      estado: form.estado || "programada",
    };
    const er = {};
    if (!payload.paciente_id) er.paciente_id = "Requerido";
    if (!payload.medico_id) er.medico_id = "Requerido";
    if (!payload.inicio) er.inicio = "Requerido";
    if (!payload.fin) er.fin = "Requerido";
    if (!er.inicio && !er.fin && new Date(payload.fin) <= new Date(payload.inicio)) er.fin = "Debe ser > inicio";
    setErrors(er);
    if (Object.keys(er).length) return;

    setCreating(true);
    try {
      await create(payload);
      setForm({ paciente_id: "", medico_id: "", inicio: "", fin: "", motivo: "", estado: "programada" });
      setErrors({});
      alert("Cita creada");
    } catch (e) {
      alert("Error creando: " + e.message);
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id) => {
    if (!confirm(`Eliminar cita #${id}?`)) return;
    try { await remove(id); } catch (e) { alert("Error: " + e.message); }
  };

  return (
    <div className="container">
      <header>
        <h1>Citas</h1>
        <div className="api-config">
          <label htmlFor="apiBase">API Base</label>
          <input id="apiBase" value={apiBase} onChange={(e) => setApiBaseState(e.target.value)} placeholder="/" />
          <button onClick={onSaveBase}>Guardar</button>
        </div>
      </header>

      <main>
        <section className="card">
          <h2>Programar cita</h2>
          <form onSubmit={onCreate} className="grid-form">
            <div className="form-row">
              <label>Paciente ID</label>
              <input value={form.paciente_id} onChange={setF("paciente_id")} aria-invalid={!!errors.paciente_id} />
              {errors.paciente_id && <small className="field-error">{errors.paciente_id}</small>}
            </div>
            <div className="form-row">
              <label>Médico ID</label>
              <input value={form.medico_id} onChange={setF("medico_id")} aria-invalid={!!errors.medico_id} />
              {errors.medico_id && <small className="field-error">{errors.medico_id}</small>}
            </div>
            <div className="form-row">
              <label>Inicio</label>
              <input type="datetime-local" value={form.inicio} onChange={setF("inicio")} aria-invalid={!!errors.inicio} />
              {errors.inicio && <small className="field-error">{errors.inicio}</small>}
            </div>
            <div className="form-row">
              <label>Fin</label>
              <input type="datetime-local" value={form.fin} onChange={setF("fin")} aria-invalid={!!errors.fin} />
              {errors.fin && <small className="field-error">{errors.fin}</small>}
            </div>
            <div className="form-row">
              <label>Motivo</label>
              <input value={form.motivo} onChange={setF("motivo")} />
            </div>
            <div className="form-row">
              <label>Estado</label>
              <select value={form.estado} onChange={setF("estado")}>
                <option value="programada">programada</option>
                <option value="reprogramada">reprogramada</option>
                <option value="cancelada">cancelada</option>
                <option value="hecha">hecha</option>
              </select>
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
            <input className="search-input" placeholder="Filtrar por paciente_id" value={query.paciente_id} onChange={(e) => setQuery((s) => ({ ...s, paciente_id: e.target.value }))} />
            <input className="search-input" placeholder="Filtrar por medico_id" value={query.medico_id} onChange={(e) => setQuery((s) => ({ ...s, medico_id: e.target.value }))} />
            <select className="search-input" value={query.estado} onChange={(e) => setQuery((s) => ({ ...s, estado: e.target.value }))}>
              <option value="">(estado)</option>
              <option value="programada">programada</option>
              <option value="reprogramada">reprogramada</option>
              <option value="cancelada">cancelada</option>
              <option value="hecha">hecha</option>
            </select>
            <input className="search-input" type="datetime-local" value={query.from} onChange={(e) => setQuery((s) => ({ ...s, from: e.target.value }))} title="Desde" />
            <input className="search-input" type="datetime-local" value={query.to} onChange={(e) => setQuery((s) => ({ ...s, to: e.target.value }))} title="Hasta (exclusivo)" />
          </div>

          {error && <div className="list-status error">Error: {error}</div>}
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Paciente</th>
                <th>Médico</th>
                <th>Inicio</th>
                <th>Fin</th>
                <th>Motivo</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8}><div className="empty-state">Sin citas.</div></td></tr>
              ) : (
                filtered.map((a) => (
                  <Row key={a.id} item={a} onUpdate={update} onDelete={onDelete} />
                ))
              )}
            </tbody>
          </table>
        </section>
      </main>

      <footer><small>appointments-react · conectado a appointments-api</small></footer>
    </div>
  );
}
