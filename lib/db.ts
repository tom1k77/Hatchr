// lib/db.ts
import { Pool } from "pg";

// Берём строку подключения из разных вариантов, которые создаёт Vercel+Neon.
// ВАЖНО: никаких throw new Error тут не делаем, чтобы билд не падал.
const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  "";

// Один общий пул для всех запросов
export const pool = new Pool({
  connectionString,
  max: 3,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});
