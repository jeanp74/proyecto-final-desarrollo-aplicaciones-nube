import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { connectMongo, isValidObjectId } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4003;
const SERVICE = process.env.SERVICE_NAME || "pharmacy-api";

/* ============ Conexión a Cosmos ============ */
await connectMongo();

/* ============ Modelos (Mongoose) ============ */
const MedicineSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    sku: { type: String, trim: true, unique: true, sparse: true }, // opcional único
    stock: { type: Number, required: true, min: 0 },
    precio: { type: Number, default: 0, min: 0 },
    unidad: { type: String, trim: true, default: "und" }, // ej. und, caja, ml
  },
  { timestamps: true, versionKey: false }
);

const PrescriptionItemSchema = new mongoose.Schema(
  {
    medicina_id: { type: mongoose.Schema.Types.ObjectId, ref: "Medicine", required: true },
    cantidad: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const PrescriptionSchema = new mongoose.Schema(
  {
    paciente_id: { type: Number, required: true }, // ID de tu servicio de pacientes (PG)
    medico_id: { type: Number, required: true },   // ID de tu servicio de doctores (PG)
    items: { type: [PrescriptionItemSchema], validate: v => v && v.length > 0 },
    notas: { type: String, trim: true },
    fecha: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false }
);

// Índices útiles
MedicineSchema.index({ nombre: 1 });
PrescriptionSchema.index({ paciente_id: 1, fecha: -1 });

const Medicine = mongoose.model("Medicine", MedicineSchema, "medicines");
const Prescription = mongoose.model("Prescription", PrescriptionSchema, "prescriptions");

/* ============ Endpoints básicos ============ */
app.get("/health", (_req, res) => res.json({ status: "ok", service: SERVICE }));
app.get("/db/health", async (_req, res) => {
  try {
    await mongoose.connection.db.command({ ping: 1 });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get("/api", (_req, res) =>
  res.json({
    GET: {
      "/medicines": "Listar medicamentos",
      "/medicines/:id": "Obtener medicamento",
      "/prescriptions": "Listar recetas (?paciente_id=&medico_id=)",
      "/prescriptions/:id": "Obtener receta",
      "/db/health": "Salud DB",
      "/health": "Salud servicio",
    },
    POST: {
      "/medicines": "Crear medicamento",
      "/prescriptions": "Crear receta y descuenta stock",
    },
    PUT: {
      "/medicines/:id": "Actualizar medicamento",
      "/medicines/:id/stock": "Ajustar stock (delta o stock)",
    },
    DELETE: { "/medicines/:id": "Eliminar medicamento" },
  })
);

/* ============ Medicamentos ============ */
// Listar
app.get("/medicines", async (_req, res) => {
  const meds = await Medicine.find().sort({ nombre: 1 }).lean();
  res.json(meds);
});

// Obtener 1
app.get("/medicines/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "ID inválido" });
  const med = await Medicine.findById(id).lean();
  if (!med) return res.status(404).json({ error: "No encontrado" });
  res.json(med);
});

// Crear
app.post("/medicines", async (req, res) => {
  try {
    const { nombre, stock, precio = 0, unidad = "und", sku } = req.body ?? {};
    if (!nombre || stock == null) return res.status(400).json({ error: "nombre y stock son obligatorios" });
    const med = await Medicine.create({ nombre, stock, precio, unidad, sku });
    res.status(201).json(med);
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: "SKU ya existe", detail: e.message });
    res.status(500).json({ error: "Error creando", detail: String(e) });
  }
});

// Actualizar
app.put("/medicines/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "ID inválido" });

  try {
    const payload = {};
    ["nombre", "sku", "precio", "unidad", "stock"].forEach((k) => {
      if (req.body?.[k] !== undefined) payload[k] = req.body[k];
    });
    const med = await Medicine.findByIdAndUpdate(id, payload, { new: true, runValidators: true }).lean();
    if (!med) return res.status(404).json({ error: "No encontrado" });
    res.json(med);
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: "SKU ya existe", detail: e.message });
    res.status(500).json({ error: "Error actualizando", detail: String(e) });
  }
});

// Eliminar
app.delete("/medicines/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "ID inválido" });
  const out = await Medicine.findByIdAndDelete(id).lean();
  if (!out) return res.status(404).json({ error: "No encontrado" });
  res.json({ message: "Eliminado", id: out._id });
});

// Ajustar stock: { delta: -3 } o { stock: 50 }
app.put("/medicines/:id/stock", async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "ID inválido" });

  const { delta, stock } = req.body ?? {};
  try {
    let med;
    if (typeof delta === "number") {
      // Incremento atómico y validación de no-negativo
      med = await Medicine.findOneAndUpdate(
        { _id: id, stock: { $gte: -delta } }, // evita negativos
        { $inc: { stock: delta } },
        { new: true }
      ).lean();
      if (!med) return res.status(409).json({ error: "Stock insuficiente o no encontrado" });
    } else if (typeof stock === "number" && stock >= 0) {
      med = await Medicine.findByIdAndUpdate(id, { stock }, { new: true }).lean();
      if (!med) return res.status(404).json({ error: "No encontrado" });
    } else {
      return res.status(400).json({ error: "Debes enviar { delta } o { stock } válido" });
    }
    res.json(med);
  } catch (e) {
    res.status(500).json({ error: "Error ajustando stock", detail: String(e) });
  }
});

/* ============ Recetas ============ */
// Listar (filtros opcionales)
app.get("/prescriptions", async (req, res) => {
  const q = {};
  if (req.query.paciente_id) q.paciente_id = Number(req.query.paciente_id);
  if (req.query.medico_id) q.medico_id = Number(req.query.medico_id);
  const items = await Prescription.find(q).sort({ fecha: -1 }).lean();
  res.json(items);
});

// Obtener 1
app.get("/prescriptions/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "ID inválido" });
  const p = await Prescription.findById(id).lean();
  if (!p) return res.status(404).json({ error: "No encontrado" });
  res.json(p);
});

// Crear receta y descontar stock
app.post("/prescriptions", async (req, res) => {
  try {
    const { paciente_id, medico_id, items, notas } = req.body ?? {};
    if (!paciente_id || !medico_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "paciente_id, medico_id e items son obligatorios" });
    }
    // Validar que todas las medicinas existan y haya stock suficiente
    const ids = items.map((it) => it.medicina_id).filter((x) => isValidObjectId(x));
    if (ids.length !== items.length) return res.status(400).json({ error: "Algún medicina_id es inválido" });

    const meds = await Medicine.find({ _id: { $in: ids } }).select({ _id: 1, stock: 1, nombre: 1 }).lean();
    const byId = new Map(meds.map((m) => [String(m._id), m]));
    for (const it of items) {
      const m = byId.get(String(it.medicina_id));
      if (!m) return res.status(404).json({ error: `Medicina no encontrada: ${it.medicina_id}` });
      if (typeof it.cantidad !== "number" || it.cantidad <= 0) return res.status(400).json({ error: "cantidad debe ser > 0" });
      if (m.stock < it.cantidad) return res.status(409).json({ error: `Stock insuficiente para ${m.nombre}` });
    }

    // Descontar stock (bulk) — nota: no transaccional multi-doc; para garantías fuertes usar transacciones
    const ops = items.map((it) => ({
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(it.medicina_id), stock: { $gte: it.cantidad } },
        update: { $inc: { stock: -it.cantidad } },
      },
    }));
    const bulk = await Medicine.bulkWrite(ops, { ordered: true });
    if (bulk.result?.nModified === 0 && bulk.modifiedCount === 0) {
      return res.status(409).json({ error: "No se pudo descontar stock (condición falló)" });
    }

    const presc = await Prescription.create({
      paciente_id: Number(paciente_id),
      medico_id: Number(medico_id),
      items: items.map((it) => ({ medicina_id: it.medicina_id, cantidad: Number(it.cantidad) })),
      notas,
    });
    res.status(201).json(presc);
  } catch (e) {
    res.status(500).json({ error: "Error creando receta", detail: String(e) });
  }
});

/* ============ Static + SPA fallback ============ */
const publicDir = path.join(__dirname, "../public");
app.use(express.static(publicDir));
app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.listen(PORT, () => console.log(`✅ ${SERVICE} escuchando en http://localhost:${PORT}`));
