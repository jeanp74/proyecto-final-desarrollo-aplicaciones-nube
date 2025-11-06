import { useEffect, useMemo, useState } from "react";
import {
  api,
  getApiBase, setApiBase,
  getPatientsBase, setPatientsBase,
  getDoctorsBase,  setDoctorsBase,
  extGet
} from "./api";

/* ===== Helpers UI ===== */
const money = (n) =>
  Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(n || 0));
const fmtId = (row) => row?.id ?? (row?._id ? String(row._id).slice(-6) : "—");
const asInt = (v) => (isNaN(parseInt(v, 10)) ? 0 : parseInt(v, 10));

/* ===== Hooks pharmacy ===== */
function useMedicines() {
  const [items, setItems] = useState([]);
  const [loading, setLoad] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoad(true);
    setError("");
    try {
      const data = await api("/medicines");
      data.sort(
        (a, b) => (a.id ?? 1e12) - (b.id ?? 1e12) || String(a.nombre).localeCompare(String(b.nombre))
      );
      setItems(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoad(false);
    }
  };

  const create = async (payload) => {
    const r = await api("/medicines", { method: "POST", body: JSON.stringify(payload) });
    setItems((prev) => [...prev, r]);
  };
  const update = async (id, payload) => {
    const r = await api(`/medicines/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    setItems((prev) => prev.map((x) => (x.id === id ? r : x)));
  };
  const remove = async (id) => {
    await api(`/medicines/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  return { items, loading, error, load, create, update, remove, setItems };
}

function usePrescriptions() {
  const create = async (payload) =>
    api("/prescriptions", { method: "POST", body: JSON.stringify(payload) });
  return { create };
}

/* ===== Catálogos externos (Pacientes / Doctores) ===== */
function useRoster(kind /* "patients" | "doctors" */) {
  const isPatients = kind === "patients";
  const getBase = isPatients ? getPatientsBase : getDoctorsBase;
  const setBaseLS = isPatients ? setPatientsBase : setDoctorsBase;

  const [base, setBase] = useState(getBase());
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    if (!base) return;
    setBusy(true);
    setErr("");
    try {
      const data = await extGet(base, `/${kind}`);
      // normalizo para mostrar en selects
      const mapped = (data || []).map((x) => ({
        id: x.id,
        nombre:
          x.nombre_completo || [x.nombres, x.apellidos].filter(Boolean).join(" ") || x.name || "",
        correo: x.correo || x.email || "",
        especialidad: x.especialidad || "",
      }));
      setItems(mapped);
      setBaseLS(base); // persiste
    } catch (e) {
      setErr(e.message || "Error cargando");
      setItems([]);
    } finally {
      setBusy(false);
    }
  };

  // === Auto-carga inicial y cuando cambia la base ===
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  return { base, setBase, items, busy, err, load };
}

const labelPaciente = (p) =>
  [p.id, p.nombre, p.correo ? `(${p.correo})` : ""].filter(Boolean).join(" — ");
const labelMedico = (d) =>
  [d.id, d.nombre, d.especialidad ? `(${d.especialidad})` : ""].filter(Boolean).join(" — ");

/* ============================ App ============================ */
export default function App() {
  // Bases de APIs (header)
  const [apiBase, setApiBaseState] = useState(getApiBase());
  const patients = useRoster("patients");
  const doctors = useRoster("doctors");

  // Pharmacy data
  const meds = useMedicines();
  const rx = usePrescriptions();

  // === Carga automática al abrir (igual que Citas) ===
  useEffect(() => {
    meds.load();
    // patients.load() y doctors.load() ya se disparan en sus propios hooks
    // gracias al useEffect([base]) dentro de useRoster.
  }, []);

  /* ----- Registrar medicamento ----- */
  const [mForm, setMForm] = useState({ nombre: "", sku: "", precio: 0, unidad: "und", stock: 0 });
  const setM = (k) => (e) => setMForm((s) => ({ ...s, [k]: e.target.value }));
  const createMedicine = async (e) => {
    e.preventDefault();
    if (!mForm.nombre || !mForm.sku) return alert("Nombre y SKU son obligatorios");
    const payload = {
      nombre: mForm.nombre.trim(),
      sku: mForm.sku.trim(),
      precio: Number(mForm.precio || 0),
      unidad: mForm.unidad.trim() || "und",
      stock: Number(mForm.stock || 0),
    };
    try {
      await meds.create(payload);
      setMForm({ nombre: "", sku: "", precio: 0, unidad: "und", stock: 0 });
      meds.load();
    } catch (e) {
      alert("Error creando medicamento: " + e.message);
    }
  };

  const quickAdjust = async (row, delta) => {
    const nuevo = Math.max(0, asInt(row.stock) + delta);
    try {
      await meds.update(row.id, { stock: nuevo });
      meds.setItems((prev) => prev.map((x) => (x.id === row.id ? { ...x, stock: nuevo } : x)));
    } catch (e) {
      alert("No se pudo ajustar stock: " + e.message);
    }
  };

  /* ----- Crear receta ----- */
  const [rForm, setRForm] = useState({
    paciente_id: "",
    medico_id: "",
    item_medicina_id: "",
    item_cantidad: 1,
    notas: "",
  });
  const [itemsReceta, setItemsReceta] = useState([]); // {medicina_id, cantidad}
  const setR = (k) => (e) => setRForm((s) => ({ ...s, [k]: e.target.value }));

  const addItem = () => {
    const oid = rForm.item_medicina_id; // usamos _id de la medicina para máxima compatibilidad
    const qty = Math.max(1, Number(rForm.item_cantidad || 1));
    if (!oid) return;
    const m = meds.items.find((x) => String(x._id) === String(oid));
    if (!m) return;
    setItemsReceta((prev) => {
      const idx = prev.findIndex((p) => String(p.medicina_id) === String(oid));
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], cantidad: copy[idx].cantidad + qty };
        return copy;
      }
      return [...prev, { medicina_id: oid, cantidad: qty }];
    });
    setRForm((s) => ({ ...s, item_cantidad: 1, item_medicina_id: "" }));
  };

  const removeItem = (oid) =>
    setItemsReceta((prev) => prev.filter((p) => String(p.medicina_id) !== String(oid)));

  const createPrescription = async (e) => {
    e.preventDefault();
    if (!rForm.paciente_id || !rForm.medico_id) return alert("Paciente y Médico son obligatorios");
    if (itemsReceta.length === 0) return alert("Agrega al menos un medicamento");

    const payload = {
      paciente_id: Number(rForm.paciente_id),
      medico_id: Number(rForm.medico_id),
      items: itemsReceta.map((it) => ({
        medicina_id: it.medicina_id, // enviamos _id (string)
        cantidad: Number(it.cantidad),
      })),
      notas: rForm.notas?.trim() || null,
    };

    try {
      await rx.create(payload);
      setRForm({ paciente_id: "", medico_id: "", item_medicina_id: "", item_cantidad: 1, notas: "" });
      setItemsReceta([]);
      alert("Receta creada");
      // Si tu backend descuenta stock al crear receta, puedes recargar inventario:
      meds.load();
    } catch (e) {
      alert("Error creando receta: " + e.message);
    }
  };

  // Filtro inventario
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return meds.items;
    return meds.items.filter(
      (m) => String(m.nombre).toLowerCase().includes(s) || String(m.sku).toLowerCase().includes(s)
    );
  }, [q, meds.items]);

  return (
    <div className="container">
      <header>
        <h1>Farmacia</h1>
        <div className="api-config">
          <label htmlFor="apiBase">API Base</label>
          <input
            id="apiBase"
            value={apiBase}
            onChange={(e) => setApiBaseState(e.target.value)}
            placeholder="/"
          />

          <label htmlFor="patientsBase" style={{ marginLeft: 12 }}>Pacientes API</label>
          <input
            id="patientsBase"
            value={patients.base}
            onChange={(e) => patients.setBase(e.target.value)}
            placeholder="https://patients-..."
            title="URL base de Pacientes (termina en /)"
          />
          <button className="secondary" onClick={patients.load} disabled={patients.busy}>
            Cargar
          </button>

          <label htmlFor="doctorsBase" style={{ marginLeft: 12 }}>Doctores API</label>
          <input
            id="doctorsBase"
            value={doctors.base}
            onChange={(e) => doctors.setBase(e.target.value)}
            placeholder="https://doctors-..."
            title="URL base de Doctores (termina en /)"
          />
          <button className="secondary" onClick={doctors.load} disabled={doctors.busy}>
            Cargar
          </button>

          <button
            style={{ marginLeft: 12 }}
            onClick={() => {
              try {
                // valida URLs y persiste
                new URL(apiBase, window.location.origin);
                new URL(patients.base, window.location.origin);
                new URL(doctors.base, window.location.origin);
                setApiBase(apiBase);
                setPatientsBase(patients.base);
                setDoctorsBase(doctors.base);
                alert("Bases guardadas");
              } catch {
                alert("Alguna URL es inválida");
              }
            }}
          >
            Guardar bases
          </button>
        </div>
      </header>

      <main>
        {/* ===== Registrar medicamento ===== */}
        <section className="card">
          <h2>Registrar medicamento</h2>
          <form className="grid-form" onSubmit={createMedicine}>
            <div className="form-row">
              <label>Nombre</label>
              <input value={mForm.nombre} onChange={setM("nombre")} />
            </div>
            <div className="form-row">
              <label>SKU</label>
              <input value={mForm.sku} onChange={setM("sku")} />
            </div>
            <div className="form-row">
              <label>Precio</label>
              <input type="number" step="0.01" value={mForm.precio} onChange={setM("precio")} />
            </div>
            <div className="form-row">
              <label>Unidad</label>
              <input value={mForm.unidad} onChange={setM("unidad")} placeholder="und, caja, frasco..." />
            </div>
            <div className="form-row">
              <label>Stock</label>
              <input type="number" value={mForm.stock} onChange={setM("stock")} />
            </div>
            <button type="submit">Crear</button>
          </form>
        </section>

        {/* ===== Inventario ===== */}
        <section className="card">
          <div className="list-header">
            <h2>Inventario</h2>
            <div className="right">
              <small>Registros: {filtered.length}</small>
              <button onClick={meds.load} disabled={meds.loading}>
                {meds.loading ? "Cargando..." : "Actualizar"}
              </button>
            </div>
          </div>

          <div className="list-tools">
            <input
              className="search-input"
              placeholder="Buscar por nombre o SKU..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {meds.error && <div className="list-status error">Error: {meds.error}</div>}

          <table className="table">
            <thead>
              <tr>
                <th className="w-min">ID</th>
                <th>Nombre</th>
                <th>SKU</th>
                <th>Precio</th>
                <th>Unidad</th>
                <th>Stock</th>
                <th className="w-min">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">Sin medicamentos.</div>
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr key={m.id ?? m._id}>
                    <td className="mono">{fmtId(m)}</td>
                    <td><div className="cell-title">{m.nombre}</div></td>
                    <td className="mono">{m.sku}</td>
                    <td>{money(m.precio)}</td>
                    <td>{m.unidad || "—"}</td>
                    <td className="mono">{m.stock}</td>
                    <td className="row-actions">
                      <button className="secondary" onClick={() => quickAdjust(m, +1)}>+1</button>
                      <button className="secondary" onClick={() => quickAdjust(m, -1)}>-1</button>
                      <button
                        className="danger"
                        onClick={async () => {
                          if (!confirm(`Eliminar ${m.nombre}?`)) return;
                          try {
                            await meds.remove(m.id);
                          } catch (e) {
                            alert("Error: " + e.message);
                          }
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* ===== Crear receta ===== */}
        <section className="card">
          <h2>Crear receta</h2>
          <form className="grid-form" onSubmit={createPrescription}>
            <div className="form-row">
              <label>Paciente</label>
              <div className="pretty-select">
                <select value={rForm.paciente_id} onChange={setR("paciente_id")}>
                  <option value="">{patients.busy ? "Cargando..." : "Seleccione un paciente"}</option>
                  {patients.items.map((p) => (
                    <option key={p.id} value={p.id}>{labelPaciente(p)}</option>
                  ))}
                </select>
              </div>
              {patients.err && <small className="field-error">Pacientes: {patients.err}</small>}
            </div>

            <div className="form-row">
              <label>Médico</label>
              <div className="pretty-select">
                <select value={rForm.medico_id} onChange={setR("medico_id")}>
                  <option value="">{doctors.busy ? "Cargando..." : "Seleccione un médico"}</option>
                  {doctors.items.map((d) => (
                    <option key={d.id} value={d.id}>{labelMedico(d)}</option>
                  ))}
                </select>
              </div>
              {doctors.err && <small className="field-error">Doctores: {doctors.err}</small>}
            </div>

            <div className="form-row">
              <label>Medicamento</label>
              <div className="pretty-select">
                <select
                  value={rForm.item_medicina_id}
                  onChange={setR("item_medicina_id")}
                >
                  <option value="">(seleccione)</option>
                  {meds.items.map((m) => (
                    <option key={m._id ?? m.id} value={m._id}>
                      {m.nombre} — stock {m.stock}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <label>Cantidad</label>
              <input type="number" min="1" value={rForm.item_cantidad} onChange={setR("item_cantidad")} />
              <button type="button" className="secondary" onClick={addItem}>Agregar ítem</button>
            </div>

            <div className="form-row">
              <label>Notas</label>
              <input value={rForm.notas} onChange={setR("notas")} />
            </div>

            <button type="submit">Crear receta</button>
          </form>

          <div className="card" style={{ marginTop: 12 }}>
            <h3>Ítems de la receta</h3>
            {itemsReceta.length === 0 ? (
              <div className="empty-state">Sin ítems.</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Medicamento</th>
                    <th className="w-min">Cant.</th>
                    <th className="w-min">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsReceta.map((it) => {
                    const med = meds.items.find((m) => String(m._id) === String(it.medicina_id));
                    return (
                      <tr key={it.medicina_id}>
                        <td>{med ? med.nombre : `#${it.medicina_id}`}</td>
                        <td className="mono">{it.cantidad}</td>
                        <td className="row-actions">
                          <button className="danger" onClick={() => removeItem(it.medicina_id)}>
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>

      <footer>
        <small>pharmacy-react · conectado a pharmacy-api</small>
      </footer>
    </div>
  );
}
