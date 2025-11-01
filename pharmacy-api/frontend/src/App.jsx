import { useEffect, useMemo, useState } from "react";
import { api, getApiBase, setApiBase } from "./api";

/* ===== Utils ===== */
const fmtMoney = (n) => {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "0.00";
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/* ====== Inventario (Medicines) ====== */
function useMedicines() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    try {
      const data = await api("/medicines");
      const sorted = [...data].sort((a, b) => {
        const ai = a.id ?? 0, bi = b.id ?? 0;
        if (ai && bi && ai !== bi) return ai - bi;
        return String(a.nombre || "").localeCompare(String(b.nombre || ""));
      });
      setItems(sorted);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const create = async (payload) => {
    const m = await api("/medicines", { method: "POST", body: JSON.stringify(payload) });
    setItems((prev) => [...prev, m].sort((a, b) => (a.id ?? 0) - (b.id ?? 0) || String(a.nombre||"").localeCompare(String(b.nombre||""))));
  };

  const update = async (id, payload) => {
    const m = await api(`/medicines/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    setItems((prev) => prev.map((x) => ((x._id === id || x.id === id) ? m : x)));
  };

  const remove = async (id) => {
    await api(`/medicines/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((x) => x._id !== id && x.id !== id));
  };

  const adjustStock = async (id, body) => {
    const m = await api(`/medicines/${id}/stock`, { method: "PUT", body: JSON.stringify(body) });
    setItems((prev) => prev.map((x) => ((x._id === id || x.id === id) ? m : x)));
  };

  return { items, loading, error, load, create, update, remove, adjustStock };
}

/* ====== Fila de inventario ====== */
function MedRow({ item, onUpdate, onDelete, onAdjust }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(item);
  const [delta, setDelta] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState({});

  useEffect(() => setForm(item), [item]);
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  const onSave = async () => {
    const f = {
      nombre: (form.nombre || "").trim(),
      sku: (form.sku || "").trim() || undefined,
      precio: Number(form.precio ?? 0),
      unidad: (form.unidad || "und").trim(),
      stock: Number(form.stock ?? 0),
    };
    const e = {};
    if (!f.nombre) e.nombre = "Requerido";
    if (f.precio < 0 || !Number.isFinite(f.precio)) e.precio = ">= 0";
    if (f.stock < 0 || !Number.isFinite(f.stock)) e.stock = ">= 0";
    setErr(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      await onUpdate(item._id, f);
      setEditing(false);
    } finally { setSaving(false); }
  };

  const onApplyDelta = async () => {
    const d = Number(delta);
    if (!Number.isFinite(d) || d === 0) return alert("Delta inválido");
    try {
      await onAdjust(item._id, { delta: d });
      setDelta("");
    } catch (e) { alert(e.message); }
  };

  const idShown = item.id ?? (item._id ? String(item._id).slice(-6) : "—");

  return (
    <tr>
      <td className="mono w-min">{idShown}</td>

      <td>
        {editing ? (
          <>
            <input className="row-edit-input" value={form.nombre || ""} onChange={set("nombre")} aria-invalid={!!err.nombre} />
            {err.nombre && <small className="field-error">{err.nombre}</small>}
          </>
        ) : (
          <>
            <div className="cell-title">{item.nombre}</div>
            <div className="cell-sub">{item.sku ? `SKU ${item.sku}` : "—"}</div>
          </>
        )}
      </td>

      <td className="right">
        {editing ? (
          <>
            <input className="row-edit-input" value={form.precio ?? 0} onChange={set("precio")} aria-invalid={!!err.precio} />
            {err.precio && <small className="field-error">{err.precio}</small>}
          </>
        ) : (
          "$ " + fmtMoney(item.precio)
        )}
      </td>

      <td className="center">
        {editing ? (
          <input className="row-edit-input" value={form.unidad || "und"} onChange={set("unidad")} />
        ) : (
          item.unidad || "und"
        )}
      </td>

      <td className="right">
        {editing ? (
          <>
            <input className="row-edit-input" value={form.stock ?? 0} onChange={set("stock")} aria-invalid={!!err.stock} />
            {err.stock && <small className="field-error">{err.stock}</small>}
          </>
        ) : (
          item.stock ?? 0
        )}
      </td>

      <td className="row-actions w-min">
        {editing ? (
          <>
            <button onClick={onSave} disabled={saving}>Guardar</button>
            <button className="secondary" onClick={() => setEditing(false)} disabled={saving}>Cancelar</button>
          </>
        ) : (
          <>
            <input
              className="row-edit-input"
              style={{ width: 64 }}
              placeholder="+/-"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
              title="Ajuste de stock (positivo o negativo)"
            />
            <button className="secondary" onClick={onApplyDelta}>Aplicar</button>
            <button className="secondary" onClick={() => setEditing(true)}>Editar</button>
            <button className="danger" onClick={() => onDelete(item._id)}>Eliminar</button>
          </>
        )}
      </td>
    </tr>
  );
}

/* ====== Recetas (referencias a otros servicios) ====== */
const LS_PAC = "pharmacy_patients_api_base";
const LS_DOC = "pharmacy_doctors_api_base";
const DEFAULT_PAC = import.meta.env.VITE_PATIENTS_API || "https://patients-proyecto-final-desarrollo-dvdpe0eegng6atfy.brazilsouth-01.azurewebsites.net/";
const DEFAULT_DOC = import.meta.env.VITE_DOCTORS_API  || "https://doctors-proyecto-final-desarrollo-b7aqbdbpcgd0d7bq.brazilsouth-01.azurewebsites.net/";

const getPatientsApiBase = () => localStorage.getItem(LS_PAC) || DEFAULT_PAC;
const setPatientsApiBase = (v) => localStorage.setItem(LS_PAC, v);
const getDoctorsApiBase  = () => localStorage.getItem(LS_DOC) || DEFAULT_DOC;
const setDoctorsApiBase  = (v) => localStorage.setItem(LS_DOC, v);

function usePrescriptions() {
  const [items, setItems] = useState([]);
  const load = async (filters = {}) => {
    const qs = new URLSearchParams(filters).toString();
    const data = await api("/prescriptions" + (qs ? `?${qs}` : ""));
    setItems(data);
  };
  const create = async (payload) => {
    const p = await api("/prescriptions", { method: "POST", body: JSON.stringify(payload) });
    setItems((prev) => [p, ...prev]);
  };
  return { items, load, create };
}

export default function App() {
  const inv = useMedicines();
  const presc = usePrescriptions();

  /* bases externas (pacientes / doctores) */
  const [pacApiBase, setPacApiBase] = useState(getPatientsApiBase());
  const [docApiBase, setDocApiBase] = useState(getDoctorsApiBase());
  const [pacientes, setPacientes] = useState([]);
  const [doctores, setDoctores] = useState([]);

  const loadRefs = async () => {
    try {
      const [p, d] = await Promise.all([
        fetch(`${pacApiBase}patients`).then(r => r.json()),
        fetch(`${docApiBase}doctors`).then(r => r.json()),
      ]);
      setPacientes(p); setDoctores(d);
    } catch (e) { alert("Error cargando pacientes/doctores: " + e.message); }
  };

  /* init */
  const [apiBase, setApiBaseState] = useState(getApiBase());
  useEffect(() => { inv.load(); presc.load(); loadRefs(); }, []);

  /* filtro inventario */
  const [query, setQuery] = useState("");
  const [qDeb, setQDeb] = useState("");
  useEffect(() => { const t = setTimeout(() => setQDeb(query.trim().toLowerCase()), 250); return () => clearTimeout(t); }, [query]);

  const filtered = useMemo(() => {
    if (!qDeb) return inv.items;
    return inv.items.filter((m) => [m.nombre, m.sku].some((v) => String(v || "").toLowerCase().includes(qDeb)));
  }, [inv.items, qDeb]);

  /* crear medicamento */
  const [form, setForm] = useState({ nombre: "", sku: "", precio: "0", unidad: "und", stock: "0" });
  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  const onSaveBase = () => {
    try { const u = new URL(apiBase, window.location.origin); if (!u.protocol.startsWith("http")) throw new Error(); setApiBase(apiBase); alert("API Base guardada"); }
    catch { alert("URL inválida"); }
  };

  const onCreate = async (e) => {
    e.preventDefault();
    const payload = {
      nombre: form.nombre.trim(),
      sku: form.sku.trim() || undefined,
      precio: Number(form.precio),
      unidad: form.unidad.trim() || "und",
      stock: Number(form.stock),
    };
    if (!payload.nombre) return alert("Nombre requerido");
    if (!Number.isFinite(payload.stock) || payload.stock < 0) return alert("Stock inválido");
    try {
      await inv.create(payload);
      setForm({ nombre: "", sku: "", precio: "0", unidad: "und", stock: "0" });
    } catch (e) { alert(e.message); }
  };

  /* ====== Crear receta ====== */
  const [rx, setRx] = useState({
    paciente_id: "", medico_id: "",
    item_medicina_id: "", item_cantidad: "",
    items: [], notas: ""
  });

  const addRxItem = () => {
    const id = rx.item_medicina_id;
    const cantidad = Number(rx.item_cantidad);
    if (!id || !Number.isFinite(cantidad) || cantidad <= 0) return alert("Selecciona medicina y cantidad > 0");
    const med = inv.items.find((m) => m._id === id);
    if (!med) return alert("Medicina inválida");
    setRx((s) => ({
      ...s,
      item_medicina_id: "", item_cantidad: "",
      items: [...s.items, { medicina_id: id, nombre: med.nombre, cantidad }]
    }));
  };

  const removeRxItem = (idx) => setRx((s) => ({ ...s, items: s.items.filter((_, i) => i !== idx) }));

  const submitRx = async (e) => {
    e.preventDefault();
    const payload = {
      paciente_id: Number(rx.paciente_id),
      medico_id: Number(rx.medico_id),
      items: rx.items.map(({ medicina_id, cantidad }) => ({ medicina_id, cantidad })),
      notas: rx.notas.trim() || undefined
    };
    if (!payload.paciente_id || !payload.medico_id || payload.items.length === 0) return alert("Paciente, médico e items requeridos");
    try {
      await presc.create(payload);
      alert("Receta creada y stock descontado");
      setRx({ paciente_id: "", medico_id: "", item_medicina_id: "", item_cantidad: "", items: [], notas: "" });
      inv.load();
    } catch (e) { alert("Error creando receta: " + e.message); }
  };

  const idShownRx = (x) => x.id ?? (x._id ? String(x._id).slice(-6) : "—");

  return (
    <div className="container">
      <header>
        <h1>Farmacia</h1>
        <div className="api-config">
          <label htmlFor="apiBase">API Base</label>
          <input id="apiBase" value={apiBase} onChange={(e) => setApiBaseState(e.target.value)} placeholder="/" />
          <button onClick={onSaveBase}>Guardar</button>
        </div>
      </header>

      <main>
        {/* Inventario — Crear */}
        <section className="card">
          <h2>Registrar medicamento</h2>
          <form onSubmit={onCreate} className="grid-form">
            <div className="form-row"><label>Nombre</label><input value={form.nombre} onChange={set("nombre")} /></div>
            <div className="form-row"><label>SKU</label><input value={form.sku} onChange={set("sku")} /></div>
            <div className="form-row"><label>Precio</label><input value={form.precio} onChange={set("precio")} /></div>
            <div className="form-row"><label>Unidad</label><input value={form.unidad} onChange={set("unidad")} /></div>
            <div className="form-row"><label>Stock</label><input value={form.stock} onChange={set("stock")} /></div>
            <button type="submit">Crear</button>
          </form>
        </section>

        {/* Inventario — Listado */}
        <section className="card">
          <div className="list-header">
            <h2>Inventario</h2>
            <div className="right">
              <small>Registros: {filtered.length}</small>
              <button onClick={inv.load} disabled={inv.loading}>{inv.loading ? "Cargando..." : "Actualizar"}</button>
            </div>
          </div>
          <div className="list-tools">
            <input className="search-input" placeholder="Buscar por nombre o SKU..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {inv.error && <div className="list-status error">Error: {inv.error}</div>}

          <table className="table">
            <thead>
              <tr>
                <th className="w-min">ID</th>
                <th>Nombre / SKU</th>
                <th className="right">Precio</th>
                <th className="center">Unidad</th>
                <th className="right">Stock</th>
                <th className="w-min">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6}><div className="empty-state">Sin medicamentos.</div></td></tr>
              ) : filtered.map((m) => (
                <MedRow key={m._id} item={m} onUpdate={inv.update} onDelete={inv.remove} onAdjust={inv.adjustStock} />
              ))}
            </tbody>
          </table>
        </section>

        {/* Recetas */}
        <section className="card">
          <h2>Crear receta</h2>

          {/* Configuración de APIs externas + botón Cargar */}
          <div className="list-tools" style={{ marginTop: 0 }}>
            <input className="search-input" value={pacApiBase} onChange={(e)=>setPacApiBase(e.target.value)} />
            <button className="secondary" onClick={()=>{ setPatientsApiBase(pacApiBase); }}>Guardar Pacientes API</button>
            <input className="search-input" value={docApiBase} onChange={(e)=>setDocApiBase(e.target.value)} />
            <button className="secondary" onClick={()=>{ setDoctorsApiBase(docApiBase); }}>Guardar Doctores API</button>
            <button onClick={loadRefs}>Cargar</button>
          </div>

          <form onSubmit={submitRx} className="grid-form">
            <div className="form-row">
              <label>Paciente</label>
              <div className="pretty-select">
                <select
                  value={rx.paciente_id}
                  onChange={(e) => setRx((s) => ({ ...s, paciente_id: e.target.value }))}
                >
                  <option value="">Seleccione paciente</option>
                  {pacientes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id} — {p.nombres} {p.apellidos} ({p.correo})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <label>Médico</label>
              <div className="pretty-select">
                <select
                  value={rx.medico_id}
                  onChange={(e) => setRx((s) => ({ ...s, medico_id: e.target.value }))}
                >
                  <option value="">Seleccione médico</option>
                  {doctores.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.id} — {d.nombre_completo} ({d.especialidad || "—"})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <label>Medicamento</label>
              <div className="pretty-select">
                <select value={rx.item_medicina_id} onChange={(e) => setRx((s) => ({ ...s, item_medicina_id: e.target.value }))}>
                  <option value="">(seleccione)</option>
                  {inv.items.map((m) => <option key={m._id} value={m._id}>{m.nombre} — stock {m.stock}</option>)}
                </select>
              </div>
            </div>

            <div className="form-row"><label>Cantidad</label><input value={rx.item_cantidad} onChange={(e) => setRx((s) => ({ ...s, item_cantidad: e.target.value }))} /></div>
            <div className="form-row"><button type="button" onClick={addRxItem}>Agregar ítem</button></div>
            <div className="form-row"><label>Notas</label><input value={rx.notas} onChange={(e) => setRx((s) => ({ ...s, notas: e.target.value }))} /></div>
            <button type="submit">Crear receta</button>
          </form>

          <div className="card" style={{ marginTop: "1rem" }}>
            <h3>Ítems de la receta</h3>
            {rx.items.length === 0 ? <div className="empty-state">Sin ítems.</div> :
              <ul>
                {rx.items.map((it, idx) => (
                  <li key={idx}>
                    {it.nombre} × {it.cantidad} <button className="danger" onClick={() => removeRxItem(idx)}>Quitar</button>
                  </li>
                ))}
              </ul>
            }
          </div>

          <div className="card" style={{ marginTop: "1rem" }}>
            <h3>Recientes</h3>
            <ul>
              {presc.items.map((p) => (
                <li key={p._id}>#{idShownRx(p)} · paciente {p.paciente_id} · médico {p.medico_id} · {new Date(p.fecha).toLocaleString()}</li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer><small>pharmacy-react · conectado a pharmacy-api</small></footer>
    </div>
  );
}
