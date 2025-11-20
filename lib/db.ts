// lib/db.ts
import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  "";

if (!connectionString) {
  // Не валим билд, просто предупреждаем.
  console.warn(
    "[db] DATABASE_URL / POSTGRES_URL_NON_POOLING не заданы. " +
      "Рут /api/refresh-markets не сможет обновлять цифры."
  );
}

// Если connectionString пустой — пул всё равно создадим, но
// любые реальные запросы просто упадут в рантайме (что ок).
export const pool = new Pool({
  connectionString: connectionString || undefined,
  ssl: {
    rejectUnauthorized: false,
  },
});
