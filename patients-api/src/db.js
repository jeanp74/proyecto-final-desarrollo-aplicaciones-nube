// Conexión a PostgreSQL (Azure PG exige TLS)
import pg from "pg";
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.PATIENTS_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
