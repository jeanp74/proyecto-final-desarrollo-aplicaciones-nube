// products-api/src/db.js
// import mongoose from "mongoose";

// const uri = process.env.PHARMACY_MONGO_URI; // <- nueva variable

// export async function connectMongo() {
//   if (!uri) throw new Error("PHARMACY_MONGO_URI no iniciada");
//   // Para Cosmos RU-based, asegúrate de retryWrites=false en la URI
//   // Para vCore, el SRV ya trae opciones correctas
//   try {
//     await mongoose.connect(uri, {
//       serverSelectionTimeoutMS: 8000,
//       dbName: "shop"            // <- FORZAMOS la DB 'shop'
//     });
//     console.log("✅ Connected a Mongo (Cosmos DB) en DB: shop");
//   } catch (err) {
//     console.error("❌ Error conectando a Mongo:", err);
//     throw err;
//   }
// }



// Conexión a Azure Cosmos DB for MongoDB (RU)
// Usa tu variable oficial PHARMACY_MONGO_URI (fallback a MONGO_URI)
import mongoose from "mongoose";

const uri = process.env.PHARMACY_MONGO_URI;

export async function connectMongo() {
  if (!uri) throw new Error("PHARMACY_MONGO_URI no está definida");
  // Nota: en Cosmos usa ?ssl=true&retrywrites=false en la cadena
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 30000,
    dbName: "shop"
  });
  console.log("✅ Conectado a Cosmos (Mongo API)");
}

export function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}
