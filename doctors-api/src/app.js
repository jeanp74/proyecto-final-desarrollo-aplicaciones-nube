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

const PORT = process.env.PORT || 4004;
const SERVICE = process.env.SERVICE_NAME || "doctors-api";

/* ================ ENDPOINTS ================ */
app.get("/health", (_req, res) => res.json({ status: "ok", service: SERVICE }));
app.get("/db/health", async (_req, res) => {
  try {
    const r = await pool.query("SELECT 1 AS ok");
    res.json({ ok: r.rows[0]?.ok === 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get("/api", (_req, res) => {
  res.json({
    GET: {
      "/doctors": "Listar médicos",
      "/doctors/:id": "Ver médico por id",
      "/db/health": "Salud de la BD",
      "/health": "Salud del servicio"
    },
    POST: { "/doctors": "Crear médico" },
    PUT:  { "/doctors/:id": "Actualizar médico" },
    DELETE: { "/doctors/:id": "Eliminar médico" }
  });
});

// Listar
app.get("/doctors", async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, nombre_completo, especialidad, correo, telefono, activo
       FROM doctors_schema.medicos
       ORDER BY id ASC`
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: "Error listando médicos", detail: String(e) });
  }
});

// Obtener 1
app.get("/doctors/:id", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, nombre_completo, especialidad, correo, telefono, activo
       FROM doctors_schema.medicos WHERE id=$1`,
      [Number(req.params.id)]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Médico no encontrado" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: "Error consultando médico", detail: String(e) });
  }
});

// Crear
app.post("/doctors", async (req, res) => {
  const { nombre_completo, especialidad, correo, telefono = null, activo = true } = req.body ?? {};
  if (!nombre_completo || !especialidad) {
    return res.status(400).json({ error: "nombre_completo y especialidad son obligatorios" });
  }

  try {
    const r = await pool.query(
      `INSERT INTO doctors_schema.medicos
       (nombre_completo, especialidad, correo, telefono, activo)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, nombre_completo, especialidad, correo, telefono, activo`,
      [nombre_completo, especialidad, correo ?? null, telefono, !!activo]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === "23505") {
      return res.status(409).json({ error: "Correo o licencia ya registrado", detail: e.detail || String(e) });
    }
    res.status(500).json({ error: "Error creando médico", detail: String(e) });
  }
});

// Actualizar (parcial)
app.put("/doctors/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { nombre_completo = null, especialidad = null, correo = null, telefono = null, activo = null } = req.body ?? {};

  try {
    const r = await pool.query(
      `UPDATE doctors_schema.medicos SET
         nombre_completo = COALESCE($2, nombre_completo),
         especialidad    = COALESCE($3, especialidad),
         correo          = COALESCE($4, correo),
         telefono        = COALESCE($5, telefono),
         activo          = COALESCE($6, activo)
       WHERE id = $1
       RETURNING id, nombre_completo, especialidad, correo, telefono, activo`,
      [id, nombre_completo, especialidad, correo, telefono, activo]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Médico no encontrado" });
    res.json(r.rows[0]);
  } catch (e) {
    if (e.code === "23505") {
      return res.status(409).json({ error: "Correo o licencia ya registrado", detail: e.detail || String(e) });
    }
    res.status(500).json({ error: "Error actualizando médico", detail: String(e) });
  }
});

// Eliminar
app.delete("/doctors/:id", async (req, res) => {
  try {
    const r = await pool.query(
      "DELETE FROM doctors_schema.medicos WHERE id=$1 RETURNING id",
      [Number(req.params.id)]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Médico no encontrado" });
    res.json({ message: "Médico eliminado", id: r.rows[0].id });
  } catch (e) {
    res.status(500).json({ error: "Error eliminando médico", detail: String(e) });
  }
});

/* ===== STATIC + SPA FALLBACK ===== */
const publicDir = path.join(__dirname, "../public");
app.use(express.static(publicDir));
app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.listen(PORT, () => console.log(`✅ ${SERVICE} en http://localhost:${PORT}`));
