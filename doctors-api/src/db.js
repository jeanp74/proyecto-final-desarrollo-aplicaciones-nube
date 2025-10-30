import pg from "pg";

export const pool = new pg.Pool({
  connectionString: process.env.USERS_DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Azure PG exige TLS; para demo deshabilitamos validación de CA
});