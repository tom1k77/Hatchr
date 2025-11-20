// lib/markets.ts
import { pool } from "./db";
import type { TokenWithMarket } from "./providers";

// небольший тип для цифр
export interface MarketRow {
  token_address: string;
  price_usd: number | null;
  market_cap_usd: number | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  updated_at: string;
}

// 1) достаём цифры для списка адресов
export async function getMarketsForAddresses(
  addresses: string[]
): Promise<Map<string, MarketRow>> {
  if (!addresses.length) return new Map();

  const lower = addresses.map((a) => a.toLowerCase());

  const { rows } = await pool.query(
    `
    SELECT
      token_address,
      price_usd,
      market_cap_usd,
      liquidity_usd,
      volume_24h_usd,
      updated_at
    FROM markets
    WHERE token_address = ANY($1)
    `,
    [lower]
  );

  const map = new Map<string, MarketRow>();

  for (const r of rows) {
    map.set(r.token_address.toLowerCase(), {
      token_address: r.token_address.toLowerCase(),
      price_usd: r.price_usd !== null ? Number(r.price_usd) : null,
      market_cap_usd: r.market_cap_usd !== null ? Number(r.market_cap_usd) : null,
      liquidity_usd: r.liquidity_usd !== null ? Number(r.liquidity_usd) : null,
      volume_24h_usd: r.volume_24h_usd !== null ? Number(r.volume_24h_usd) : null,
      updated_at:
        r.updated_at instanceof Date
          ? r.updated_at.toISOString()
          : String(r.updated_at),
    });
  }

  return map;
}

// 2) обновляем / вставляем цифры для списка токенов
export async function updateMarketsForTokens(
  tokens: TokenWithMarket[]
): Promise<void> {
  if (!tokens.length) return;

  // готовим плейсхолдеры вида:
  // ($1,$2,$3,$4,$5), ($6,$7,$8,$9,$10), ...
  const values: (string | number | null)[] = [];
  const chunks: string[] = [];

  tokens.forEach((t, idx) => {
    const base = idx * 5;
    const addr = t.token_address.toLowerCase();

    chunks.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`
    );

    values.push(
      addr,
      t.price_usd ?? null,
      t.market_cap_usd ?? null,
      t.liquidity_usd ?? null,
      t.volume_24h_usd ?? null
    );
  });

  const sql = `
    INSERT INTO markets (
      token_address,
      price_usd,
      market_cap_usd,
      liquidity_usd,
      volume_24h_usd
    )
    VALUES ${chunks.join(", ")}
    ON CONFLICT (token_address) DO UPDATE SET
      price_usd       = EXCLUDED.price_usd,
      market_cap_usd  = EXCLUDED.market_cap_usd,
      liquidity_usd   = EXCLUDED.liquidity_usd,
      volume_24h_usd  = EXCLUDED.volume_24h_usd,
      updated_at      = NOW()
  `;

  await pool.query(sql, values);
}
