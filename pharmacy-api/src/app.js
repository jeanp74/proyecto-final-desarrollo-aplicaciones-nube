import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { connectMongo, isValidObjectId } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4003;
const SERVICE = process.env.SERVICE_NAME || "pharmacy-api";

/* ========= Conexión a Cosmos (Mongo API) ========= */
await connectMongo();

/* ========= Colección compartida + discriminadores ========= */
const COLL = process.env.PRODUCTS_COLLECTION || "products";
const discriminatorKey = "__kind";
const KIND_MED = "pharmacy_medicamentos";
const KIND_RX = "pharmacy_recetas";
const KIND_COUNTER = "pharmacy_counter";

const BaseSchema = new mongoose.Schema(
  {},
  { strict: false, discriminatorKey, collection: COLL, timestamps: true }
);
const Item = mongoose.model("Item", BaseSchema, COLL);

/* Medicamentos con id numérico */
const Medicine = Item.discriminator(
  KIND_MED,
  new mongoose.Schema(
    {
      id: { type: Number, required: true },
      nombre: { type: String, required: true, trim: true },
      sku: { type: String, trim: true },
      stock: { type: Number, required: true, min: 0 },
      precio: { type: Number, default: 0, min: 0 },
      unidad: { type: String, trim: true, default: "und" },
    },
    { strict: false }
  )
);

/* Recetas con id numérico */
const Prescription = Item.discriminator(
  KIND_RX,
  new mongoose.Schema(
    {
      id: { type: Number, required: true },
      paciente_id: { type: Number, required: true },
      medico_id: { type: Number, required: true },
      items: [
        {
          medicina_id: { type: mongoose.Schema.Types.ObjectId, required: true },
          cantidad: { type: Number, required: true, min: 1 }
        },
      ],
      notas: { type: String, trim: true },
      fecha: { type: Date, default: Date.now },
    },
    { strict: false }
  )
);

/* Contadores */
const Counter = Item.discriminator(
  KIND_COUNTER,
  new mongoose.Schema(
    { key: { type: String, required: true }, seq: { type: Number, default: 0 } },
    { strict: false }
  )
);
Counter.schema.index({ key: 1 }, { unique: true, sparse: true });

async function nextSeq(key) {
  const doc = await Counter.findOneAndUpdate(
    { key }, { $inc: { seq: 1 }, $setOnInsert: { key } },
    { upsert: true, new: true }
  );
  return doc.seq;
}

/* Filtro por id numérico o _id */
function buildIdFilter(idParam) {
  if (/^\d+$/.test(idParam)) return { id: Number(idParam) };
  if (isValidObjectId(idParam)) return { _id: idParam };
  return null;
}

/* ===== Health ===== */
app.get("/health", (_req, res) => res.json({ status: "ok", service: SERVICE }));
app.get("/db/health", async (_req, res) => {
  try { await mongoose.connection.db.command({ ping: 1 }); res.json({ ok: true, collection: COLL }); }
  catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
});

app.get("/", (_req, res) =>
  res.json({
    _collection: COLL,
    GET: {
      "/medicines": "Listar medicamentos",
      "/medicines/:id": "Obtener medicamento por _id o id numérico",
      "/prescriptions": "Listar recetas (filtros ?paciente_id=&medico_id=)",
      "/prescriptions/:id": "Obtener receta por _id o id numérico",
      "/health": "Salud del servicio",
      "/db/health": "Salud de la base de datos"
    },
    POST: {
      "/medicines": "Crear medicamento",
      "/prescriptions": "Crear receta (descuenta stock)",
    },
    PUT: {
      "/medicines/:id": "Actualizar medicamento",
      "/medicines/:id/stock": "Ajustar stock (+/- o set)",
    },
    DELETE: { "/medicines/:id": "Eliminar medicamento" },
    note: "IDs numéricos en medicamentos y recetas; fallback a _id en rutas.",
  })
);

/* ===== Medicamentos ===== */
app.get("/medicines", async (_req, res) => {
  try {
    const meds = await Medicine.find().sort({ id: 1 }).lean();
    res.json(meds);
  } catch (e) { res.status(500).json({ error: "Error listando medicamentos", detail: String(e) }); }
});

app.get("/medicines/:id", async (req, res) => {
  try {
    const filter = buildIdFilter(req.params.id);
    if (!filter) return res.status(400).json({ error: "ID inválido" });
    const med = await Medicine.findOne(filter).lean();
    if (!med) return res.status(404).json({ error: "No encontrado" });
    res.json(med);
  } catch (e) { res.status(500).json({ error: "Error consultando medicamento", detail: String(e) }); }
});

app.post("/medicines", async (req, res) => {
  try {
    const { nombre, stock, precio = 0, unidad = "und", sku } = req.body ?? {};
    if (!nombre || stock == null) return res.status(400).json({ error: "nombre y stock son obligatorios" });
    const nextId = await nextSeq(KIND_MED);
    const med = await Medicine.create({ id: nextId, nombre, stock, precio, unidad, sku });
    res.status(201).json(med);
  } catch (e) { res.status(500).json({ error: "Error creando medicamento", detail: String(e) }); }
});

app.put("/medicines/:id", async (req, res) => {
  try {
    const filter = buildIdFilter(req.params.id);
    if (!filter) return res.status(400).json({ error: "ID inválido" });
    const payload = {};
    ["nombre", "sku", "precio", "unidad", "stock"].forEach((k) => {
      if (req.body?.[k] !== undefined) payload[k] = req.body[k];
    });
    const med = await Medicine.findOneAndUpdate(filter, payload, { new: true, runValidators: true }).lean();
    if (!med) return res.status(404).json({ error: "No encontrado" });
    res.json(med);
  } catch (e) { res.status(500).json({ error: "Error actualizando medicamento", detail: String(e) }); }
});

app.delete("/medicines/:id", async (req, res) => {
  try {
    const filter = buildIdFilter(req.params.id);
    if (!filter) return res.status(400).json({ error: "ID inválido" });
    const out = await Medicine.findOneAndDelete(filter).lean();
    if (!out) return res.status(404).json({ error: "No encontrado" });
    res.json({ message: "Eliminado", id: out._id });
  } catch (e) { res.status(500).json({ error: "Error eliminando medicamento", detail: String(e) }); }
});

/* Ajuste de stock: { delta: -3 } o { stock: 50 } */
app.put("/medicines/:id/stock", async (req, res) => {
  try {
    const filterBase = buildIdFilter(req.params.id);
    if (!filterBase) return res.status(400).json({ error: "ID inválido" });

    const { delta, stock } = req.body ?? {};
    let med;

    if (typeof delta === "number" && delta !== 0) {
      const filter = { ...filterBase, stock: { $gte: -delta } };
      med = await Medicine.findOneAndUpdate(filter, { $inc: { stock: delta } }, { new: true }).lean();
      if (!med) return res.status(409).json({ error: "Stock insuficiente o no encontrado" });
    } else if (typeof stock === "number" && stock >= 0) {
      med = await Medicine.findOneAndUpdate(filterBase, { stock }, { new: true }).lean();
      if (!med) return res.status(404).json({ error: "No encontrado" });
    } else {
      return res.status(400).json({ error: "Debes enviar { delta } o { stock } válido" });
    }

    res.json(med);
  } catch (e) { res.status(500).json({ error: "Error ajustando stock", detail: String(e) }); }
});

/* ===== Recetas ===== */
app.get("/prescriptions", async (req, res) => {
  try {
    const q = {};
    if (req.query.paciente_id) q.paciente_id = Number(req.query.paciente_id);
    if (req.query.medico_id) q.medico_id = Number(req.query.medico_id);
    const items = await Prescription.find(q).sort({ id: -1 }).lean();
    res.json(items);
  } catch (e) { res.status(500).json({ error: "Error listando recetas", detail: String(e) }); }
});

app.get("/prescriptions/:id", async (req, res) => {
  try {
    const filter = buildIdFilter(req.params.id);
    if (!filter) return res.status(400).json({ error: "ID inválido" });
    const p = await Prescription.findOne(filter).lean();
    if (!p) return res.status(404).json({ error: "No encontrado" });
    res.json(p);
  } catch (e) { res.status(500).json({ error: "Error consultando receta", detail: String(e) }); }
});

app.post("/prescriptions", async (req, res) => {
  try {
    const { paciente_id, medico_id, items, notas } = req.body ?? {};
    if (!paciente_id || !medico_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "paciente_id, medico_id e items son obligatorios" });
    }

    // Validar medicinas y stock
    const ids = items.map((it) => it.medicina_id);
    if (!ids.every((x) => mongoose.isValidObjectId(x))) return res.status(400).json({ error: "Algún medicina_id es inválido" });

    const meds = await Medicine.find({ _id: { $in: ids } }).select({ _id: 1, stock: 1, nombre: 1 }).lean();
    const byId = new Map(meds.map((m) => [String(m._id), m]));
    for (const it of items) {
      const m = byId.get(String(it.medicina_id));
      if (!m) return res.status(404).json({ error: `Medicina no encontrada: ${it.medicina_id}` });
      if (typeof it.cantidad !== "number" || it.cantidad <= 0) return res.status(400).json({ error: "cantidad debe ser > 0" });
      if (m.stock < it.cantidad) return res.status(409).json({ error: `Stock insuficiente para ${m.nombre}` });
    }

    // Descontar stock
    const bulkOps = items.map((it) => ({
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(it.medicina_id), stock: { $gte: it.cantidad } },
        update: { $inc: { stock: -it.cantidad } },
      },
    }));
    const bulk = await Medicine.bulkWrite(bulkOps, { ordered: true });
    if ((bulk.modifiedCount || 0) === 0) return res.status(409).json({ error: "No se pudo descontar stock" });

    // id numérico autoincremental para la receta
    const nextId = await nextSeq(KIND_RX);
    const presc = await Prescription.create({
      id: nextId,
      paciente_id: Number(paciente_id),
      medico_id: Number(medico_id),
      items: items.map((it) => ({ medicina_id: it.medicina_id, cantidad: Number(it.cantidad) })),
      notas,
    });
    res.status(201).json(presc);
  } catch (e) { res.status(500).json({ error: "Error creando receta", detail: String(e) }); }
});

app.listen(PORT, () => {
  console.log(`✅ ${SERVICE} en http://localhost:${PORT}`);
});
