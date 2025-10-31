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

/* ===== Config cross-service (Pacientes y Doctores) ===== */
const LS_PATIENTS = "patients_api_base";
const LS_DOCTORS = "doctors_api_base";

function getPatientsBase() {
  return localStorage.getItem(LS_PATIENTS) || import.meta.env.VITE_PATIENTS_API_BASE || "/";
}
function setPatientsBase(v) {
  localStorage.setItem(LS_PATIENTS, v);
}
function getDoctorsBase() {
  return localStorage.getItem(LS_DOCTORS) || import.meta.env.VITE_DOCTORS_API_BASE || "/";
}
function setDoctorsBase(v) {
  localStorage.setItem(LS_DOCTORS, v);
}
async function extGet(base, path) {
  const url = new URL(path, base).toString();
  const resp = await fetch(url, { headers: { "Content-Type": "application/json" } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

/* ===== Hooks de datos del propio servicio ===== */
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

/* ===== Hooks de catálogos externos ===== */
function useRoster(baseGetter, path, labelFn) {
  const [base, setBase] = useState(baseGetter());
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    if (!base) return;
    setBusy(true); setErr("");
    try {
      const data = await extGet(base, path);
      // normaliza {id, label}
      const mapped = (data || []).map((x) => ({
        id: x.id,
        label: labelFn(x),
      }));
      setItems(mapped);
    } catch (e) {
      setErr(e.message || "Error cargando");
      setItems([]);
    } finally {
      setBusy(false);
    }
  };

  return { base, setBase, items, busy, err, load };
}

function doctorLabel(d) {
  // id + nombre + (especialidad)
  return [d.id, d.nombre_completo, d.especialidad ? `(${d.especialidad})` : ""].filter(Boolean).join(" — ");
}
function patientLabel(p) {
  // id + nombre (muestra correo/identificación si existe)
  const extra = p.correo || p.identificacion || p.documento || "";
  return [p.id, p.nombre_completo, extra ? `(${extra})` : ""].filter(Boolean).join(" — ");
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

  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

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
      <td>{item.paciente_id}</td>
      <td>{item.medico_id}</td>
      <td>{editing ? <input className="row-edit-input" type="datetime-local" value={form.inicio} onChange={set("inicio")} aria-invalid={!!errors.inicio}/> : isoToLocalInput(item.inicio)}</td>
      <td>{editing ? <input className="row-edit-input" type="datetime-local" value={form.fin} onChange={set("fin")} aria-invalid={!!errors.fin}/> : isoToLocalInput(item.fin)}</td>
      <td>{editing ? <input className="row-edit-input" value={form.motivo} onChange={set("motivo")}/> : (item.motivo || "")}</td>
      <td>
        {editing ? (
          <div className="pretty-select">
            <select className="row-edit-input" value={form.estado} onChange={set("estado")}>
              <option value="programada">programada</option>
              <option value="reprogramada">reprogramada</option>
              <option value="cancelada">cancelada</option>
              <option value="hecha">hecha</option>
            </select>
          </div>
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

  // Config API bases
  const [apiBase, setApiBaseState] = useState(getApiBase());
  const [patientsBase, setPatientsBaseState] = useState(getPatientsBase());
  const [doctorsBase, setDoctorsBaseState] = useState(getDoctorsBase());

  // Catálogos
  const patients = useRoster(getPatientsBase, "/patients", patientLabel);
  const doctors = useRoster(getDoctorsBase, "/doctors", doctorLabel);

  // Listado citas
  const [query, setQuery] = useState({ paciente_id: "", medico_id: "", estado: "", from: "", to: "" });
  const [deb, setDeb] = useState(query);
  useEffect(() => { const t = setTimeout(() => setDeb(query), 250); return () => clearTimeout(t); }, [query]);

  useEffect(() => { load(); }, []);
  useEffect(() => { patients.setBase(patientsBase); }, [patientsBase]);
  useEffect(() => { doctors.setBase(doctorsBase); }, [doctorsBase]);
  useEffect(() => { patients.load(); }, [patients.base]); // carga cuando cambia base
  useEffect(() => { doctors.load(); }, [doctors.base]);

  const filtered = useMemo(() => {
    const f = (arr) => arr
      .filter((x) => !deb.paciente_id || String(x.paciente_id) === deb.paciente_id.trim())
      .filter((x) => !deb.medico_id || String(x.medico_id) === deb.medico_id.trim())
      .filter((x) => !deb.estado || String(x.estado || "").toLowerCase() === deb.estado.trim().toLowerCase())
      .filter((x) => !deb.from || new Date(x.inicio) >= new Date(deb.from))
      .filter((x) => !deb.to   || new Date(x.inicio) <  new Date(deb.to));
    return f(items);
  }, [items, deb]);

  // Form crear cita
  const [form, setForm] = useState({
    paciente_id: "", medico_id: "", inicio: "", fin: "", motivo: "", estado: "programada",
  });
  const [creating, setCreating] = useState(false);
  const [errors, setErrors] = useState({});
  const setF = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  const onSaveBase = () => {
    try {
      const u1 = new URL(apiBase, window.location.origin);
      const u2 = new URL(patientsBase, window.location.origin);
      const u3 = new URL(doctorsBase, window.location.origin);
      if (![u1,u2,u3].every((u) => u.protocol.startsWith("http"))) throw new Error();
      setApiBase(apiBase);
      setPatientsBase(patientsBase);
      setDoctorsBase(doctorsBase);
      alert("Bases guardadas");
    } catch { alert("Alguna URL es inválida"); }
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
        <div className="api-config stack">
          <div className="row">
            <label htmlFor="apiBase">API Base</label>
            <input id="apiBase" value={apiBase} onChange={(e) => setApiBaseState(e.target.value)} placeholder="/" />
          </div>
          <div className="row">
            <label htmlFor="patientsBase">Pacientes API</label>
            <input id="patientsBase" value={patientsBase} onChange={(e) => setPatientsBaseState(e.target.value)} placeholder="https://patients-..." />
            <button className="secondary" onClick={patients.load} disabled={patients.busy}>Cargar</button>
          </div>
          <div className="row">
            <label htmlFor="doctorsBase">Doctores API</label>
            <input id="doctorsBase" value={doctorsBase} onChange={(e) => setDoctorsBaseState(e.target.value)} placeholder="https://doctors-..." />
            <button className="secondary" onClick={doctors.load} disabled={doctors.busy}>Cargar</button>
          </div>
          <button onClick={onSaveBase}>Guardar bases</button>
        </div>
      </header>

      <main>
        <section className="card">
          <h2>Programar cita</h2>
          <form onSubmit={onCreate} className="grid-form">
            {/* Paciente */}
            <div className="form-row">
              <label>Paciente</label>
              <div className="pretty-select">
                <select
                  value={form.paciente_id}
                  onChange={setF("paciente_id")}
                  aria-invalid={!!errors.paciente_id}
                >
                  <option value="">{patients.busy ? "Cargando..." : "Seleccione un paciente"}</option>
                  {patients.items.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </div>
              {errors.paciente_id && <small className="field-error">{errors.paciente_id}</small>}
              {patients.err && <small className="field-error">Pacientes: {patients.err}</small>}
            </div>

            {/* Médico */}
            <div className="form-row">
              <label>Médico</label>
              <div className="pretty-select">
                <select
                  value={form.medico_id}
                  onChange={setF("medico_id")}
                  aria-invalid={!!errors.medico_id}
                >
                  <option value="">{doctors.busy ? "Cargando..." : "Seleccione un médico"}</option>
                  {doctors.items.map((d) => (
                    <option key={d.id} value={d.id}>{d.label}</option>
                  ))}
                </select>
              </div>
              {errors.medico_id && <small className="field-error">{errors.medico_id}</small>}
              {doctors.err && <small className="field-error">Doctores: {doctors.err}</small>}
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
              <div className="pretty-select">
                <select value={form.estado} onChange={setF("estado")}>
                  <option value="programada">programada</option>
                  <option value="reprogramada">reprogramada</option>
                  <option value="cancelada">cancelada</option>
                  <option value="hecha">hecha</option>
                </select>
              </div>
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
            <div className="pretty-select">
              <select className="search-input" value={query.estado} onChange={(e) => setQuery((s) => ({ ...s, estado: e.target.value }))}>
                <option value="">(estado)</option>
                <option value="programada">programada</option>
                <option value="reprogramada">reprogramada</option>
                <option value="cancelada">cancelada</option>
                <option value="hecha">hecha</option>
              </select>
            </div>
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
