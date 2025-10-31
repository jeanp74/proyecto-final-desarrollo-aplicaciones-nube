// Conexión a PostgreSQL (Azure PG requiere TLS)
import pg from "pg";
const { Pool } = pg;

const connectionString =
  process.env.APPOINTMENTS_DATABASE_URL;

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});
