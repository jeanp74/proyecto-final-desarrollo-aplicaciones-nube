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

const PORT = process.env.PORT || 4001;
const SERVICE = process.env.SERVICE_NAME || "patients-api";

// ======== ENDPOINTS DEL API DE PACIENTES ========

// Salud del servicio
app.get("/health", (_req, res) => res.json({ status: "ok", service: SERVICE }));

// Salud de la BD
app.get("/db/health", async (_req, res) => {
  try {
    const r = await pool.query("SELECT 1 AS ok");
    res.json({ ok: r.rows[0]?.ok === 1 });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Documentación simple
app.get("/api", (_req, res) => {
  res.json({
    GET: {
      "/patients": "Listar pacientes",
      "/patients/:id": "Ver paciente por id",
      "/db/health": "Salud de la base de datos",
      "/health": "Salud del servicio"
    },
    POST: { "/patients": "Crear paciente" },
    PUT: { "/patients/:id": "Actualizar paciente" },
    DELETE: { "/patients/:id": "Eliminar paciente" }
  });
});

// Listar pacientes
app.get("/patients", async (_req, res) => {
  try {
    const q = `
      SELECT id, nombres, apellidos, documento, correo, telefono, fecha_nacimiento, genero
      FROM patients_schema.pacientes
      ORDER BY id ASC
    `;
    const r = await pool.query(q);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: "Error listando pacientes", detail: String(e) });
  }
});

// Obtener 1 paciente
app.get("/patients/:id", async (req, res) => {
  try {
    const q = `
      SELECT id, nombres, apellidos, documento, correo, telefono, fecha_nacimiento, genero
      FROM patients_schema.pacientes
      WHERE id = $1
    `;
    const r = await pool.query(q, [Number(req.params.id)]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Paciente no encontrado" });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: "Error consultando paciente", detail: String(e) });
  }
});

// Crear paciente
app.post("/patients", async (req, res) => {
  const {
    nombres, apellidos, documento, correo,
    telefono = null, fecha_nacimiento = null, genero = null
  } = req.body ?? {};

  if (!nombres || !apellidos || !documento || !correo) {
    return res.status(400).json({ error: "nombres, apellidos, documento y correo son obligatorios" });
  }

  try {
    const q = `
      INSERT INTO patients_schema.pacientes
        (nombres, apellidos, documento, correo, telefono, fecha_nacimiento, genero)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id, nombres, apellidos, documento, correo, telefono, fecha_nacimiento, genero
    `;
    const r = await pool.query(q, [nombres, apellidos, documento, correo, telefono, fecha_nacimiento, genero]);
    res.status(201).json(r.rows[0]);
  } catch (e) {
    // 23505 = unique_violation (documento/correo duplicado)
    if (e.code === "23505") {
      return res.status(409).json({ error: "Documento o correo ya registrado", detail: e.detail || String(e) });
    }
    res.status(500).json({ error: "Error creando paciente", detail: String(e) });
  }
});

// Actualizar paciente (parcial)
app.put("/patients/:id", async (req, res) => {
  const id = Number(req.params.id);
  const {
    nombres = null, apellidos = null, documento = null, correo = null,
    telefono = null, fecha_nacimiento = null, genero = null
  } = req.body ?? {};

  try {
    const q = `
      UPDATE patients_schema.pacientes SET
        nombres = COALESCE($2, nombres),
        apellidos = COALESCE($3, apellidos),
        documento = COALESCE($4, documento),
        correo = COALESCE($5, correo),
        telefono = COALESCE($6, telefono),
        fecha_nacimiento = COALESCE($7, fecha_nacimiento),
        genero = COALESCE($8, genero)
      WHERE id = $1
      RETURNING id, nombres, apellidos, documento, correo, telefono, fecha_nacimiento, genero
    `;
    const r = await pool.query(q, [id, nombres, apellidos, documento, correo, telefono, fecha_nacimiento, genero]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Paciente no encontrado" });
    res.json(r.rows[0]);
  } catch (e) {
    if (e.code === "23505") {
      return res.status(409).json({ error: "Documento o correo ya registrado", detail: e.detail || String(e) });
    }
    res.status(500).json({ error: "Error actualizando paciente", detail: String(e) });
  }
});

// Eliminar paciente
app.delete("/patients/:id", async (req, res) => {
  try {
    const r = await pool.query(
      "DELETE FROM patients_schema.pacientes WHERE id=$1 RETURNING id",
      [Number(req.params.id)]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Paciente no encontrado" });
    res.json({ message: "Paciente eliminado", id: r.rows[0].id });
  } catch (e) {
    res.status(500).json({ error: "Error eliminando paciente", detail: String(e) });
  }
});

// (Opcional) Reset de tabla para pruebas rápidas
app.put("/tables", async (_req, res) => {
  try {
    await pool.query("TRUNCATE TABLE patients_schema.pacientes RESTART IDENTITY CASCADE");
    res.json({ message: "Tabla pacientes reiniciada" });
  } catch (e) {
    res.status(500).json({ error: "Error reseteando tabla", detail: String(e) });
  }
});

// ====== SERVIR EL FRONTEND (Vite) ======
const publicDir = path.join(__dirname, "../public");
app.use(express.static(publicDir));
app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.listen(PORT, () => console.log(`✅ ${SERVICE} en http://localhost:${PORT}`));
