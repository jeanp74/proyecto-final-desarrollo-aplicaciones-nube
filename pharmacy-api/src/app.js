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

/* ========= Conexión a Cosmos (Mongo API) ========= */
await connectMongo();

/* ========= MISMA colección que products + discriminador =========
   - Colección compartida (por defecto 'products')
   - Clave discriminadora: __kind
   - Valores:
       * 'pharmacy_medicamentos'  → documentos de inventario de farmacia
       * 'pharmacy_recetas'       → documentos de recetas
*/
const COLL = process.env.PRODUCTS_COLLECTION || "products";
const discriminatorKey = "__kind";
const KIND_MED = "pharmacy_medicamentos";
const KIND_RX  = "pharmacy_recetas";

// (Opcional) Si existen documentos antiguos con otros valores, habilita compat aquí:
// const LEGACY_KIND_MED = "pharmacy_med";
// const LEGACY_KIND_RX  = "pharmacy_rx";

const BaseSchema = new mongoose.Schema(
  {},
  { strict: false, discriminatorKey, collection: COLL, timestamps: true }
);

// Modelo base que apunta a la MISMA colección
const Item = mongoose.model("Item", BaseSchema, COLL);

// Discriminador: Medicamentos (inventario)
const Medicine = Item.discriminator(
  KIND_MED,
  new mongoose.Schema(
    {
      nombre: { type: String, required: true, trim: true },
      sku: { type: String, trim: true },  // no marcamos unique para no chocar con "products"
      stock: { type: Number, required: true, min: 0 },
      precio: { type: Number, default: 0, min: 0 },
      unidad: { type: String, trim: true, default: "und" },
    },
    { strict: false }
  )
);

// Discriminador: Recetas
const Prescription = Item.discriminator(
  KIND_RX,
  new mongoose.Schema(
    {
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

/* ================== Health & Doc ================== */
app.get("/health", (_req, res) => res.json({ status: "ok", service: SERVICE }));
app.get("/db/health", async (_req, res) => {
  try {
    await mongoose.connection.db.command({ ping: 1 });
    res.json({ ok: true, collection: COLL });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.get("/api", (_req, res) =>
  res.json({
    _collection: COLL,
    GET: {
      "/medicines": "Listar medicamentos (__kind=pharmacy_medicamentos)",
      "/medicines/:id": "Obtener medicamento",
      "/prescriptions": "Listar recetas (__kind=pharmacy_recetas, filtros ?paciente_id=&medico_id=)",
      "/prescriptions/:id": "Obtener receta",
    },
    POST: {
      "/medicines": "Crear medicamento",
      "/prescriptions": "Crear receta (descuenta stock)",
    },
    PUT: {
      "/medicines/:id": "Actualizar medicamento",
      "/medicines/:id/stock": "Ajustar stock (delta o stock)",
    },
    DELETE: { "/medicines/:id": "Eliminar medicamento" },
    note: "La colección es compartida; diferenciamos por __kind.",
  })
);

/* ================== Medicamentos ================== */
// Listar SOLO los documentos de inventario
app.get("/medicines", async (_req, res) => {
  const meds = await Medicine.find().sort({ nombre: 1 }).lean();
  res.json(meds);
});

// Obtener 1 (valida que sea del tipo correcto)
app.get("/medicines/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "ID inválido" });
  const med = await Medicine.findOne({ _id: id }).lean();
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
    const med = await Medicine.findOneAndUpdate({ _id: id }, payload, {
      new: true,
      runValidators: true,
    }).lean();
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

// Ajustar stock: { delta: -3 } o { stock: 50 }
app.put("/medicines/:id/stock", async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "ID inválido" });

  const { delta, stock } = req.body ?? {};
  try {
    let med;
    if (typeof delta === "number" && delta !== 0) {
      // Usamos Item.bulkWrite para garantizar que solo toque __kind correcto
      const bulk = await Item.bulkWrite(
        [
          {
            updateOne: {
              filter: { _id: new mongoose.Types.ObjectId(id), [discriminatorKey]: KIND_MED, stock: { $gte: -delta } },
              update: { $inc: { stock: delta } },
            },
          },
        ],
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

/* ================== Recetas ================== */
// Listar SOLO recetas (no hace falta poner __kind: lo maneja el discriminador)
app.get("/prescriptions", async (req, res) => {
  const q = {};
  if (req.query.paciente_id) q.paciente_id = Number(req.query.paciente_id);
  if (req.query.medico_id) q.medico_id = Number(req.query.medico_id);
  const items = await Prescription.find(q).sort({ fecha: -1 }).lean();
  res.json(items);
});

// Obtener 1 receta
app.get("/prescriptions/:id", async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ error: "ID inválido" });
  const p = await Prescription.findOne({ _id: id }).lean();
  if (!p) return res.status(404).json({ error: "No encontrado" });
  res.json(p);
});

// Crear receta y descontar stock de medicamentos
app.post("/prescriptions", async (req, res) => {
  try {
    const { paciente_id, medico_id, items, notas } = req.body ?? {};
    if (!paciente_id || !medico_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "paciente_id, medico_id e items son obligatorios" });
    }

    // Validar medicinas y stock
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

    // Descontar stock — garantizando __kind correcto
    const bulkOps = items.map((it) => ({
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(it.medicina_id), [discriminatorKey]: KIND_MED, stock: { $gte: it.cantidad } },
        update: { $inc: { stock: -it.cantidad } },
      },
    }));
    const bulk = await Item.bulkWrite(bulkOps, { ordered: true });
    if ((bulk.modifiedCount || 0) === 0) return res.status(409).json({ error: "No se pudo descontar stock" });

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

app.listen(PORT, () => console.log(`✅ ${SERVICE} usando colección '${COLL}' y __kind { meds:'${KIND_MED}', recetas:'${KIND_RX}' } en http://localhost:${PORT}`));
