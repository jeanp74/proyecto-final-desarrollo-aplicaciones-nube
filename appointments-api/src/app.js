import express from "express";
import cors from "cors";
import { pool } from "./db.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4002;
const SERVICE = process.env.SERVICE_NAME || "appointments-api";

/* ====================== UTIL ====================== */
function toIsoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString();
}

/* ================= ENDPOINTS ====================== */
// Salud
app.get("/health", (_req, res) => res.json({ status: "ok", service: SERVICE }));
app.get("/db/health", async (_req, res) => {
  try {
    const r = await pool.query("SELECT 1 AS ok");
    res.json({ ok: r.rows[0]?.ok === 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Doc rápida
app.get("/api", (_req, res) => {
  res.json({
    GET: {
      "/appointments": "Listar (filtros: ?paciente_id=&medico_id=&estado=&from=&to=)",
      "/appointments/:id": "Obtener cita por id",
      "/db/health": "Salud de la BD",
      "/health": "Salud del servicio"
    },
    POST: { "/appointments": "Crear cita" },
    PUT:  { "/appointments/:id": "Actualizar cita" },
    DELETE: { "/appointments/:id": "Eliminar cita" }
  });
});

// Listar con filtros opcionales
app.get("/appointments", async (req, res) => {
  try {
    const { paciente_id, medico_id, estado, from, to } = req.query;
    const where = [];
    const params = [];
    let i = 1;

    if (paciente_id) { where.push(`paciente_id = $${i++}`); params.push(Number(paciente_id)); }
    if (medico_id)   { where.push(`medico_id  = $${i++}`); params.push(Number(medico_id)); }
    if (estado)      { where.push(`estado ILIKE $${i++}`); params.push(estado); }
    if (from)        { where.push(`inicio >= $${i++}`);    params.push(toIsoOrNull(from)); }
    if (to)          { where.push(`inicio <  $${i++}`);    params.push(toIsoOrNull(to)); }

    const sql = `
      SELECT id, paciente_id, medico_id, inicio, fin, motivo, estado
      FROM appointments_schema.citas
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY inicio ASC
    `;
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: "Error listando citas", detail: String(e) });
  }
});

// Obtener 1
app.get("/appointments/:id", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, paciente_id, medico_id, inicio, fin, motivo, estado
       FROM appointments_schema.citas WHERE id=$1`,
      [Number(req.params.id)]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Cita no encontrada" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: "Error consultando cita", detail: String(e) });
  }
});

// Crear
app.post("/appointments", async (req, res) => {
  const { paciente_id, medico_id, inicio, fin, motivo = null, estado = "programada" } = req.body ?? {};
  if (!paciente_id || !medico_id || !inicio || !fin) {
    return res.status(400).json({ error: "paciente_id, medico_id, inicio y fin son obligatorios" });
  }
  const iISO = toIsoOrNull(inicio), fISO = toIsoOrNull(fin);
  if (!iISO || !fISO) return res.status(400).json({ error: "Fechas inválidas" });
  if (new Date(fISO) <= new Date(iISO)) return res.status(400).json({ error: "fin debe ser mayor a inicio" });

  try {
    const r = await pool.query(
      `INSERT INTO appointments_schema.citas
       (paciente_id, medico_id, inicio, fin, motivo, estado)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, paciente_id, medico_id, inicio, fin, motivo, estado`,
      [Number(paciente_id), Number(medico_id), iISO, fISO, motivo, estado]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === "23503") {
      // FK violation
      return res.status(409).json({ error: "Paciente o médico no existe (FK)", detail: e.detail || String(e) });
    }
    res.status(500).json({ error: "Error creando cita", detail: String(e) });
  }
});

// Actualizar (parcial)
app.put("/appointments/:id", async (req, res) => {
  const id = Number(req.params.id);
  // Normalizamos a null (para COALESCE)
  const payload = {
    paciente_id: req.body?.paciente_id ?? null,
    medico_id:   req.body?.medico_id ?? null,
    inicio:      toIsoOrNull(req.body?.inicio) ?? null,
    fin:         toIsoOrNull(req.body?.fin) ?? null,
    motivo:      req.body?.motivo ?? null,
    estado:      req.body?.estado ?? null,
  };

  if (payload.inicio && payload.fin && new Date(payload.fin) <= new Date(payload.inicio)) {
    return res.status(400).json({ error: "fin debe ser mayor a inicio" });
  }

  try {
    const r = await pool.query(
      `UPDATE appointments_schema.citas SET
         paciente_id = COALESCE($2, paciente_id),
         medico_id   = COALESCE($3, medico_id),
         inicio      = COALESCE($4, inicio),
         fin         = COALESCE($5, fin),
         motivo      = COALESCE($6, motivo),
         estado      = COALESCE($7, estado)
       WHERE id = $1
       RETURNING id, paciente_id, medico_id, inicio, fin, motivo, estado`,
      [id, payload.paciente_id, payload.medico_id, payload.inicio, payload.fin, payload.motivo, payload.estado]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Cita no encontrada" });
    res.json(r.rows[0]);
  } catch (e) {
    if (e.code === "23503") {
      return res.status(409).json({ error: "Paciente o médico no existe (FK)", detail: e.detail || String(e) });
    }
    res.status(500).json({ error: "Error actualizando cita", detail: String(e) });
  }
});

// Eliminar
app.delete("/appointments/:id", async (req, res) => {
  try {
    const r = await pool.query(
      "DELETE FROM appointments_schema.citas WHERE id=$1 RETURNING id",
      [Number(req.params.id)]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Cita no encontrada" });
    res.json({ message: "Cita eliminada", id: r.rows[0].id });
  } catch (e) {
    res.status(500).json({ error: "Error eliminando cita", detail: String(e) });
  }
});

// Reset (opcional para pruebas)
app.put("/tables", async (_req, res) => {
  try {
    await pool.query("TRUNCATE TABLE appointments_schema.citas RESTART IDENTITY CASCADE");
    res.json({ message: "Tabla citas reiniciada" });
  } catch (e) {
    res.status(500).json({ error: "Error reseteando tabla", detail: String(e) });
  }
});

/* ===== STATIC + SPA FALLBACK ===== */
const publicDir = path.join(__dirname, "../public");
app.use(express.static(publicDir));
app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.listen(PORT, () => console.log(`✅ ${SERVICE} en http://localhost:${PORT}`));
