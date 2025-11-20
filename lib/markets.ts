// lib/markets.ts
import { pool } from "./db";

export interface MarketRow {
  token_address: string;
  price_usd: number | null;
  market_cap_usd: number | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  updated_at: string;
}

export async function getMarketsForAddresses(
  addresses: string[]
): Promise<Map<string, MarketRow>> {
  if (!addresses.length) return new Map();

  const lower = addresses.map((a) => a.toLowerCase());

  const { rows } = await pool.query(
    `SELECT token_address, price_usd, market_cap_usd, liquidity_usd, volume_24h_usd, updated_at
     FROM markets
     WHERE token_address = ANY($1)`,
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
      updated_at: r.updated_at,
    });
  }
  return map;
}

export async function upsertMarketRow(row: MarketRow) {
  await pool.query(
    `INSERT INTO markets (token_address, price_usd, market_cap_usd, liquidity_usd, volume_24h_usd)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (token_address)
     DO UPDATE SET
       price_usd = EXCLUDED.price_usd,
       market_cap_usd = EXCLUDED.market_cap_usd,
       liquidity_usd = EXCLUDED.liquidity_usd,
       volume_24h_usd = EXCLUDED.volume_24h_usd,
       updated_at = NOW()`,
    [
      row.token_address.toLowerCase(),
      row.price_usd,
      row.market_cap_usd,
      row.liquidity_usd,
      row.volume_24h_usd,
    ]
  );
}
