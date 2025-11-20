// lib/markets.ts
import { pool } from "./db";
import type { Token } from "./providers";

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
      updated_at: r.updated_at.toISOString
        ? r.updated_at.toISOString()
        : String(r.updated_at),
    });
  }

  return map;
}

// lib/markets.ts (продолжение)
const GECKO_BASE_TOKENS =
  "https://api.geckoterminal.com/api/v2/networks/base/tokens";

function toNum(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function fetchMarketForToken(token: Token) {
  let price: number | null = null;
  let marketCap: number | null = null;
  let liquidity: number | null = null;
  let volume24: number | null = null;

  try {
    const res = await fetch(`${GECKO_BASE_TOKENS}/${token.token_address}`, {
      cache: "no-store",
    });

    if (res.ok) {
      const data: any = await res.json();
      const attr = data?.data?.attributes || {};

      price = toNum(attr.price_usd);

      marketCap = toNum(
        attr.market_cap_usd ??
          attr.fully_diluted_valuation_usd ??
          attr.fully_diluted_valuation ??
          attr.fdv_usd
      );

      liquidity = toNum(attr.liquidity_usd ?? attr.reserve_in_usd);

      volume24 = toNum(
        attr.volume_usd?.h24 ??
          attr.trade_volume_24h_usd ??
          attr.trade_volume_24h ??
          attr.volume_24h_usd
      );
    }

    // fallback для Zora — берём их цифры, если Gecko ничего не знает
    if (token.source === "zora") {
      if (price == null || price === 0) {
        price = toNum((token as any).zora_price_usd);
      }
      if (marketCap == null || marketCap === 0) {
        marketCap = toNum((token as any).zora_market_cap_usd);
      }
      if (volume24 == null || volume24 === 0) {
        volume24 = toNum((token as any).zora_volume_24h_usd);
      }
    }
  } catch (e) {
    console.error("[markets] fetchMarketForToken error", token.token_address, e);
  }

  return { price, marketCap, liquidity, volume24 };
}

// батч-апдейт
export async function updateMarketsForTokens(tokens: Token[]) {
  if (!tokens.length) return;

  // можно ограничить, чтобы не упираться в лимиты Gecko
  const CHUNK = 20;
  for (let i = 0; i < tokens.length; i += CHUNK) {
    const slice = tokens.slice(i, i + CHUNK);

    const rows: {
      token_address: string;
      price_usd: number | null;
      market_cap_usd: number | null;
      liquidity_usd: number | null;
      volume_24h_usd: number | null;
    }[] = [];

    for (const t of slice) {
      const m = await fetchMarketForToken(t);
      rows.push({
        token_address: t.token_address.toLowerCase(),
        price_usd: m.price,
        market_cap_usd: m.marketCap,
        liquidity_usd: m.liquidity,
        volume_24h_usd: m.volume24,
      });
    }

    const client = await pool.connect();
    try {
      const valuesSql = rows
        .map(
          (_, idx) =>
            `($${idx * 5 + 1}, $${idx * 5 + 2}, $${idx * 5 + 3}, $${idx * 5 + 4}, $${idx * 5 + 5})`
        )
        .join(",");

      const values: any[] = [];
      for (const r of rows) {
        values.push(
          r.token_address,
          r.price_usd,
          r.market_cap_usd,
          r.liquidity_usd,
          r.volume_24h_usd
        );
      }

      await client.query(
        `
        INSERT INTO markets (token_address, price_usd, market_cap_usd, liquidity_usd, volume_24h_usd, updated_at)
        VALUES ${valuesSql}
        ON CONFLICT (token_address)
        DO UPDATE SET
          price_usd = EXCLUDED.price_usd,
          market_cap_usd = EXCLUDED.market_cap_usd,
          liquidity_usd = EXCLUDED.liquidity_usd,
          volume_24h_usd = EXCLUDED.volume_24h_usd,
          updated_at = now()
        `,
        values
      );
    } finally {
      client.release();
    }
  }
}
