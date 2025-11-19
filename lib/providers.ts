// lib/providers.ts

// ===============================================
//                TYPES
// ===============================================
export interface Token {
  token_address: string;
  name?: string;
  symbol?: string;
  source?: string;
  source_url?: string;
  first_seen_at?: string;
  farcaster_url?: string;
}

export interface TokenWithMarket extends Token {
  price_usd?: number | null;
  market_cap_usd?: number | null;
  liquidity_usd?: number | null;
  volume_24h_usd?: number | null;
}

// ===============================================
//         CONSTANTS & HELPERS
// ===============================================

const CLANKER_API = "https://www.clanker.world/api/tokens";
const CLANKER_FRONT = "https://www.clanker.world";

const GECKO_BASE = "https://api.geckoterminal.com/api/v2/networks/base/tokens";

const ZORA_API_KEY = process.env.ZORA_API_KEY;
const ZORA_API = "https://api-sdk.zora.engineering/api";

const BLOCKED_FID = ["primatirta", "pinmad", "senang", "mybrandio"];

function ms(ts: any): number {
  const n = Number(ts);
  return Number.isFinite(n) ? n : 0;
}

function toNum(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function safeFetch(url: string, opts: any = {}) {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      ...opts,
    });
    if (!res.ok) {
      console.error("[fetch error]", url, res.status);
      return null;
    }
    return res.json().catch(() => null);
  } catch (err) {
    console.error("[network error]", url, err);
    return null;
  }
}

async function fetchZora(path: string, params = {}) {
  if (!ZORA_API_KEY) {
    console.error("❌ Missing ZORA_API_KEY");
    return null;
  }

  const url = new URL(path, ZORA_API);
  Object.entries(params).forEach(([k, v]) =>
    url.searchParams.set(k, String(v))
  );

  return safeFetch(url.toString(), {
    headers: { "api-key": ZORA_API_KEY },
  });
}

// ===============================================
//        FETCH FROM CLANKER (3 hours)
// ===============================================

export async function fetchTokensFromClanker(): Promise<Token[]> {
  const now = Date.now();
  const WINDOW = 3 * 3600 * 1000;

  const startDateUnix = Math.floor((now - WINDOW) / 1000);

  let cursor: string | undefined;
  const out: any[] = [];

  for (let i = 0; i < 15; i++) {
    const p = new URLSearchParams({
      limit: "20",
      sort: "desc",
      startDate: String(startDateUnix),
      includeUser: "true",
      includeMarket: "false",
    });
    if (cursor) p.set("cursor", cursor);

    const url = `${CLANKER_API}?${p.toString()}`;
    const json = await safeFetch(url);
    if (!json?.data?.length) break;

    out.push(...json.data);
    cursor = json.cursor;
    if (!cursor) break;
  }

  const tokens: Token[] = out
    .map((t) => {
      if (t.chain_id !== 8453) return null;

      const addr = t.contract_address?.toLowerCase();
      if (!addr) return null;

      const meta = t.metadata || {};
      const creator = t.related?.user || {};

      let username =
        creator.username ||
        creator.handle ||
        creator.fname ||
        creator.name;

      if (typeof username === "string")
        username = username.replace(/^@/, "");

      let farcaster =
        username ? `https://farcaster.xyz/${username}` : undefined;

      const firstSeen =
        t.created_at || t.deployed_at || t.last_indexed || undefined;

      return {
        token_address: addr,
        name: t.name || "",
        symbol: t.symbol || "",
        source: "clanker",
        source_url: `${CLANKER_FRONT}/clanker/${addr}`,
        first_seen_at: firstSeen,
        farcaster_url: farcaster,
      };
    })
    .filter(Boolean)
    .filter((t) => now - ms(t.first_seen_at) <= WINDOW);

  return tokens;
}

// ===============================================
//        FETCH FROM ZORA (new launches)
// ===============================================

export async function fetchTokensFromZora(): Promise<Token[]> {
  const now = Date.now();
  const WINDOW = 3 * 3600 * 1000;

  if (!ZORA_API_KEY) return [];

  const json = await fetchZora("/explore", {
    category: "new",
    chain: "8453",
    limit: "250",
  });

  const arr: any[] = Array.isArray(json?.coins) ? json.coins : [];

  return arr
    .map((c) => {
      const addr = (c.address || "").toLowerCase();
      if (!addr) return null;

      const created =
        typeof c.createdAt === "number"
          ? new Date(c.createdAt).toISOString()
          : c.createdAt;

      return {
        token_address: addr,
        name: c.name || "",
        symbol: c.symbol || "",
        source: "zora",
        source_url: `https://zora.co/collect/base:${addr}`,
        first_seen_at: created,
      } as Token;
    })
    .filter(Boolean)
    .filter((t) => now - ms(t.first_seen_at) <= WINDOW);
}

// ===============================================
//     GECKOTERMINAL ENRICH (price, cap, vol)
// ===============================================

export async function enrichWithGeckoTerminal(
  tokens: Token[]
): Promise<TokenWithMarket[]> {
  const out: TokenWithMarket[] = [];

  for (const t of tokens) {
    const url = `${GECKO_BASE}/${t.token_address}`;
    const json = await safeFetch(url);

    const a = json?.data?.attributes || {};

    out.push({
      ...t,
      price_usd: toNum(a.price_usd),
      market_cap_usd: toNum(
        a.market_cap_usd ||
          a.fdv_usd ||
          a.fully_diluted_valuation_usd
      ),
      liquidity_usd: toNum(a.liquidity_usd),
      volume_24h_usd: toNum(a.trade_volume_24h_usd),
    });
  }

  return out;
}

// ===============================================
//                 AGGREGATOR
// ===============================================

export async function getTokens(): Promise<TokenWithMarket[]> {
  const [clanker, zora] = await Promise.all([
    fetchTokensFromClanker(),
    fetchTokensFromZora(),
  ]);

  const map = new Map<string, Token>();

  [...clanker, ...zora].forEach((t) =>
    map.set(t.token_address.toLowerCase(), t)
  );

  const merged = Array.from(map.values());

  return enrichWithGeckoTerminal(merged);
}
