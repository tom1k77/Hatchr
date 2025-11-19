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

// если кого-то надо резать по фарку — сюда
const BLOCKED_FARCASTER_USERS = [
  "primatirta",
  "pinmad",
  "senang",
  "mybrandio",
];

function ms(ts: any): number {
  if (!ts) return 0;
  const d = new Date(ts);
  const v = d.getTime();
  return Number.isFinite(v) ? v : 0;
}

function toNum(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function safeFetch(url: string, opts: RequestInit = {}) {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      ...opts,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(
        "[fetch error]",
        url,
        res.status,
        res.statusText,
        txt.slice(0, 200)
      );
      return null;
    }
    return (await res.json().catch(() => null)) as any;
  } catch (err) {
    console.error("[network error]", url, err);
    return null;
  }
}

async function fetchZora(path: string, params: Record<string, string | number>) {
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
  const WINDOW = 3 * 60 * 60 * 1000; // 3 часа
  const startDateUnix = Math.floor((now - WINDOW) / 1000);

  let cursor: string | undefined;
  const raw: any[] = [];

  const MAX_PAGES = 15;

  for (let i = 0; i < MAX_PAGES; i++) {
    const params = new URLSearchParams({
      limit: "20",
      sort: "desc",
      startDate: String(startDateUnix),
      includeUser: "true",
      includeMarket: "false",
    });
    if (cursor) params.set("cursor", cursor);

    const url = `${CLANKER_API}?${params.toString()}`;
    const json = await safeFetch(url);
    const data: any[] = Array.isArray(json?.data) ? json.data : [];
    if (!data.length) break;

    raw.push(...data);
    cursor = json?.cursor;
    if (!cursor) break;
  }

  const tokens: Token[] = [];

  for (const t of raw) {
    if (t.chain_id && t.chain_id !== 8453) continue;

    const addr = (t.contract_address || "").toString().toLowerCase();
    if (!addr) continue;

    const creator = t.related?.user || {};
    let username: string =
      creator.username ||
      creator.handle ||
      creator.fname ||
      creator.name ||
      "";

    if (typeof username === "string") {
      username = username.replace(/^@/, "").trim();
    }

    let farcasterUrl: string | undefined;
    if (username) {
      farcasterUrl = `https://farcaster.xyz/${username}`;
    } else if (t.fid) {
      farcasterUrl = `https://farcaster.xyz/profiles/${t.fid}`;
    }

    const firstSeen =
      t.created_at || t.deployed_at || t.last_indexed || undefined;

    const token: Token = {
      token_address: addr,
      name: (t.name || "").toString(),
      symbol: (t.symbol || "").toString(),
      source: "clanker",
      source_url: `${CLANKER_FRONT}/clanker/${addr}`,
      first_seen_at: firstSeen,
      farcaster_url: farcasterUrl,
    };

    // фильтр по ботам, если надо
    if (token.farcaster_url) {
      try {
        const u = new URL(token.farcaster_url);
        const handle = u.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
        if (handle && BLOCKED_FARCASTER_USERS.includes(handle)) continue;
      } catch {
        // ignore bad URL
      }
    }

    // фильтр 3 часа
    if (token.first_seen_at && now - ms(token.first_seen_at) > WINDOW) continue;

    tokens.push(token);
  }

  return tokens;
}

// ===============================================
//        FETCH FROM ZORA (new launches)
// ===============================================

export async function fetchTokensFromZora(): Promise<Token[]> {
  const now = Date.now();
  const WINDOW = 3 * 60 * 60 * 1000;

  if (!ZORA_API_KEY) return [];

  // Используем explore/new для Base
  const json = await fetchZora("/explore", {
    category: "new",
    chain: 8453,
    limit: 250,
  });

  const arr: any[] = Array.isArray(json?.coins) ? json.coins : [];
  const tokens: Token[] = [];

  for (const c of arr) {
    const addr = (c.address || c.contractAddress || "").toString().toLowerCase();
    if (!addr) continue;

    const createdRaw = c.createdAt ?? c.launchedAt ?? null;
    let created: string | undefined;
    if (typeof createdRaw === "number") {
      created = new Date(createdRaw).toISOString();
    } else if (typeof createdRaw === "string") {
      created = createdRaw;
    }

    const token: Token = {
      token_address: addr,
      name: (c.name || "").toString(),
      symbol: (c.symbol || "").toString(),
      source: "zora",
      source_url: `https://zora.co/coins/base:${addr}`,
      first_seen_at: created,
    };

    if (token.first_seen_at && now - ms(token.first_seen_at) > WINDOW) continue;

    tokens.push(token);
  }

  return tokens;
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
      volume_24h_usd: toNum(
        a.trade_volume_24h_usd ??
          a.volume_usd?.h24 ??
          a.volume_24h_usd
      ),
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

  for (const t of [...clanker, ...zora]) {
    map.set(t.token_address.toLowerCase(), t);
  }

  const merged = Array.from(map.values());
  const withMarket = await enrichWithGeckoTerminal(merged);

  return withMarket;
}
