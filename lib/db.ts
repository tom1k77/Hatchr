// lib/db.ts
import { Pool } from "pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Можно добавить ssl: { rejectUnauthorized: false } для Supabase/Neon, если нужно
});
