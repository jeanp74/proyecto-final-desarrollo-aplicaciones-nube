import pg from "pg";
const { Pool } = pg;

const connectionString =
  process.env.DOCTORS_DATABASE_URL;

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});
