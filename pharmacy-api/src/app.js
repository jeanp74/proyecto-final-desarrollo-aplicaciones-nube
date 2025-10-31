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

await connectMongo();

/* ====== Mismo collection + discriminadores ====== */
const COLL = process.env.PRODUCTS_COLLECTION || "products";
const discriminatorKey = "__kind";
const KIND_MED = "pharmacy_medicamentos";
const KIND_RX  = "pharmacy_recetas";
const KIND_COUNTER = "pharmacy_counter";   // << nuevo: contador interno

const BaseSchema = new mongoose.Schema(
  {},
  { strict: false, discriminatorKey, collection: COLL, timestamps: true }
);

const Item = mongoose.model("Item", BaseSchema, COLL);

// ---- Modelos con id (Number) autoincremental ----
const Medicine = Item.discriminator(
  KIND_MED,
  new mongoose.Schema(
    {
      id:     { type: Number, required: true },  // << id numérico secuencial
      nombre: { type: String, required: true, trim: true },
      sku:    { type: String, trim: true },
      stock:  { type: Number, required: true, min: 0 },
      precio: { type: Number, default: 0, min: 0 },
      unidad: { type: String, trim: true, default: "und" },
    },
    { strict: false }
  )
);

const Prescription = Item.discriminator(
  KIND_RX,
  new mongoose.Schema(
    {
      id:          { type: Number, required: true }, // << id numérico secuencial
      paciente_id: { type: Number, required: true },
      medico_id:   { type: Number, required: true },
      items: [
        {
          medicina_id: { type: mongoose.Schema.Types.ObjectId, required: true },
          cantidad:    { type: Number, required: true, min: 1 },
        },
      ],
      notas: { type: String, trim: true },
      fecha: { type: Date, default: Date.now },
    },
    { strict: false }
  )
);

// Opcional: contador como discriminador (para claridad)
const Counter = Item.discriminator(
  KIND_COUNTER,
  new mongoose.Schema({ seq: { type: Number, default: 0 } }, { strict: false })
);

/* ====== helper: siguiente valor de secuencia ======
   - Guarda el contador en la MISMA colección (products)
   - Doc del contador: { _id: <clave>, __kind: 'pharmacy_counter', seq: N }
   - Es atómico con $inc y upsert: new:true devuelve el valor actualizado
==================================================== */
async function nextSeq(seqKey) {
  const r = await Item.findOneAndUpdate(
    { _id: seqKey, [discriminatorKey]: KIND_COUNTER },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  ).lean();
  return r.seq; // 1, 2, 3, ...
}

/* ================== Endpoints ================== */

app.get("/health", (_req, res) => res.json({ status: "ok", service: SERVICE }));
app.get("/db/health", async (_req, res) => {
  try { await mongoose.connection.db.command({ ping: 1 }); res.json({ ok: true, collection: COLL }); }
  catch (e) { res.status(500).json({ ok: false, error: String(e) }); }
});

/* ---- Medicamentos ---- */

// Listar (puedes ordenar por id numérico si quieres)
app.get("/medicines", async (_req, res) => {
  const meds = await Medicine.find().sort({ id: 1 }).lean();
  res.json(meds);
});

// Obtener 1 (por _id de Mongo, igual que antes)
app.get("/medicines/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "ID inválido" });
  const med = await Medicine.findOne({ _id: id }).lean();
  if (!med) return res.status(404).json({ error: "No encontrado" });
  res.json(med);
});

// Crear (asigna id numérico secuencial DESDE 1)
app.post("/medicines", async (req, res) => {
  try {
    const { nombre, stock, precio = 0, unidad = "und", sku } = req.body ?? {};
    if (!nombre || stock == null) return res.status(400).json({ error: "nombre y stock son obligatorios" });

    const nextId = await nextSeq(KIND_MED); // << 1,2,3...
    const med = await Medicine.create({ id: nextId, nombre, stock, precio, unidad, sku });
    res.status(201).json(med);
  } catch (e) {
    res.status(500).json({ error: "Error creando", detail: String(e) });
  }
});

// Actualizar (no tocamos el id)
app.put("/medicines/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "ID inválido" });

  try {
    const payload = {};
    ["nombre", "sku", "precio", "unidad", "stock"].forEach((k) => {
      if (req.body?.[k] !== undefined) payload[k] = req.body[k];
    });
    const med = await Medicine.findOneAndUpdate({ _id: id }, payload, { new: true, runValidators: true }).lean();
    if (!med) return res.status(404).json({ error: "No encontrado" });
    res.json(med);
  } catch (e) {
    res.status(500).json({ error: "Error actualizando", detail: String(e) });
  }
});

// Eliminar
app.delete("/medicines/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "ID inválido" });
  const out = await Medicine.findOneAndDelete({ _id: id }).lean();
  if (!out) return res.status(404).json({ error: "No encontrado" });
  res.json({ message: "Eliminado", id: out._id });
});

// Ajustar stock (igual que antes)
app.put("/medicines/:id/stock", async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "ID inválido" });
  const { delta, stock } = req.body ?? {};
  try {
    let med;
    if (typeof delta === "number" && delta !== 0) {
      const bulk = await Item.bulkWrite(
        [{ updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(id), [discriminatorKey]: KIND_MED, stock: { $gte: -delta } },
          update: { $inc: { stock: delta } },
        }}],
        { ordered: true }
      );
      if ((bulk.modifiedCount || 0) === 0) return res.status(409).json({ error: "Stock insuficiente o no encontrado" });
      med = await Medicine.findOne({ _id: id }).lean();
    } else if (typeof stock === "number" && stock >= 0) {
      med = await Medicine.findOneAndUpdate({ _id: id }, { stock }, { new: true }).lean();
      if (!med) return res.status(404).json({ error: "No encontrado" });
    } else {
      return res.status(400).json({ error: "Debes enviar { delta } o { stock } válido" });
    }
    res.json(med);
  } catch (e) {
    res.status(500).json({ error: "Error ajustando stock", detail: String(e) });
  }
});

/* ---- Recetas ---- */

app.get("/prescriptions", async (req, res) => {
  const q = {};
  if (req.query.paciente_id) q.paciente_id = Number(req.query.paciente_id);
  if (req.query.medico_id)   q.medico_id   = Number(req.query.medico_id);
  const items = await Prescription.find(q).sort({ id: -1 }).lean(); // << orden por id si prefieres
  res.json(items);
});

app.get("/prescriptions/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "ID inválido" });
  const p = await Prescription.findOne({ _id: id }).lean();
  if (!p) return res.status(404).json({ error: "No encontrado" });
  res.json(p);
});

// Crear receta (asigna id numérico y descuenta stock)
app.post("/prescriptions", async (req, res) => {
  try {
    const { paciente_id, medico_id, items, notas } = req.body ?? {};
    if (!paciente_id || !medico_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "paciente_id, medico_id e items son obligatorios" });
    }

    const ids = items.map((it) => it.medicina_id);
    if (!ids.every(isValidObjectId)) return res.status(400).json({ error: "Algún medicina_id es inválido" });

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
        filter: { _id: new mongoose.Types.ObjectId(it.medicina_id), [discriminatorKey]: KIND_MED, stock: { $gte: it.cantidad } },
        update: { $inc: { stock: -it.cantidad } },
      },
    }));
    const bulk = await Item.bulkWrite(bulkOps, { ordered: true });
    if ((bulk.modifiedCount || 0) === 0) return res.status(409).json({ error: "No se pudo descontar stock" });

    // Obtener id secuencial para la receta
    const nextId = await nextSeq(KIND_RX); // << 1,2,3...
    const presc = await Prescription.create({
      id: nextId,
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

/* ===== Static + SPA fallback ===== */
const publicDir = path.join(__dirname, "../public");
app.use(express.static(publicDir));
app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.listen(PORT, () =>
  console.log(`✅ ${SERVICE} en http://localhost:${PORT} (colección '${COLL}', ids numéricos)`));
