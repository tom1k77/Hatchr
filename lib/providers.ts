// lib/providers.ts

// -------- Типы --------

export interface Token {
  token_address: string;
  name?: string;
  symbol?: string;
  source?: string;
  source_url?: string;
  first_seen_at?: string;

  // socials
  farcaster_url?: string;
  website_url?: string;
  x_url?: string;
  telegram_url?: string;
}

export interface TokenWithMarket extends Token {
  price_usd?: number | null;
  market_cap_usd?: number | null;
  liquidity_usd?: number | null;
  volume_24h_usd?: number | null;
}

// --- Farcaster-боты, которых отрезаем ---
const BLOCKED_FARCASTER_USERS = ["primatirta", "pinmad", "senang", "mybrandio"];

function isBlockedCreator(farcasterUrl?: string | null): boolean {
  if (!farcasterUrl) return false;
  try {
    const url = new URL(farcasterUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    if (!parts[0]) return false;
    const handle = parts[0].toLowerCase();
    return BLOCKED_FARCASTER_USERS.includes(handle);
  } catch {
    return false;
  }
}

// -------- Константы --------

const CLANKER_API = "https://www.clanker.world/api/tokens";
const CLANKER_FRONT = "https://www.clanker.world";

const GECKO_BASE_TOKENS =
  "https://api.geckoterminal.com/api/v2/networks/base/tokens";

// Zora SDK
const ZORA_BASE_URL = "https://api-sdk.zora.engineering/api";
const ZORA_API_KEY = process.env.ZORA_API_KEY;

// -------- Утилиты --------

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} — ${res.status}`);
  return res.json();
}

async function fetchZora(path: string, params: Record<string, string>) {
  if (!ZORA_API_KEY) {
    console.error("[Zora] Missing ZORA_API_KEY");
    return null;
  }

  const url = new URL(path, ZORA_BASE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { "api-key": ZORA_API_KEY },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[Zora] Error:", res.status, body.slice(0, 200));
    return null;
  }

  return res.json();
}

function collectUrls(obj: any, depth = 0, acc: string[] = []): string[] {
  if (!obj || depth > 6) return acc;

  if (typeof obj === "string") {
    if (obj.startsWith("http://") || obj.startsWith("https://")) acc.push(obj);
    return acc;
  }

  if (Array.isArray(obj)) {
    for (const v of obj) collectUrls(v, depth + 1, acc);
    return acc;
  }

  if (typeof obj === "object") {
    for (const k of Object.keys(obj)) collectUrls(obj[k], depth + 1, acc);
    return acc;
  }

  return acc;
}

// ======================= CLANKER (3 часа) =======================

export async function fetchTokensFromClanker(): Promise<Token[]> {
  const now = Date.now();
  const WINDOW_MS = 3 * 3600 * 1000;

  const windowAgo = now - WINDOW_MS;
  const startDateUnix = Math.floor(windowAgo / 1000);

  let cursor: string | undefined;
  const collected: any[] = [];
  const MAX_PAGES = 15;

  for (let i = 0; i < MAX_PAGES; i++) {
    const p = new URLSearchParams({
      limit: "20",
      sort: "desc",
      startDate: String(startDateUnix),
      includeUser: "true",
      includeMarket: "false",
    });
    if (cursor) p.set("cursor", cursor);

    const url = `${CLANKER_API}?${p.toString()}`;
    const raw = await fetchJson(url);

    const data = Array.isArray(raw?.data) ? raw.data : [];
    if (!data.length) break;

    collected.push(...data);
    cursor = raw.cursor;
    if (!cursor) break;
  }

  const tokens = collected
    .map((t: any) => {
      if (t.chain_id !== 8453) return null;

      const addr = (t.contract_address || "").toLowerCase();
      if (!addr) return null;

      const name = t.name || "";
      const symbol = t.symbol || "";

      const meta = t.metadata || {};
      const creator = t.related?.user || {};

      const urls = [...collectUrls(meta), ...collectUrls(creator)];
      let farcasterUrl = urls.find((u) =>
        u.toLowerCase().includes("farcaster.xyz")
      );

      const rawUsername =
        creator.username ||
        creator.handle ||
        creator.fname ||
        creator.name ||
        "";
      const username = (rawUsername || "").replace(/^@/, "").trim();

      if (!farcasterUrl && username)
        farcasterUrl = `https://farcaster.xyz/${username}`;

      const firstSeen =
        t.created_at || t.deployed_at || t.last_indexed || undefined;

      const token: Token = {
        token_address: addr,
        name,
        symbol,
        source: "clanker",
        source_url: `${CLANKER_FRONT}/clanker/${addr}`,
        first_seen_at: firstSeen,
        farcaster_url: farcasterUrl,
      };

      if (isBlockedCreator(farcasterUrl)) return null;

      return token;
    })
    .filter(Boolean) as Token[];

  return tokens.filter((t) => {
    const ts = new Date(t.first_seen_at || 0).getTime();
    return now - ts <= WINDOW_MS;
  });
}

// ======================= ZORA (новые токены /explore) =======================

export async function fetchTokensFromZora(): Promise<Token[]> {
  const now = Date.now();
  const WINDOW_MS = 3 * 3600 * 1000;

  if (!ZORA_API_KEY) {
    console.error("[Zora] No API Key — skipping Zora tokens");
    return [];
  }

  const json = await fetchZora("/explore", {
    category: "new",
    chain: "8453",
    limit: "200",
  });

  const items: any[] = Array.isArray(json?.coins) ? json.coins : [];
  if (!items.length) return [];

  const tokens = items
    .map((c: any) => {
      const addr = (c.address || "").toLowerCase();
      if (!addr) return null;

      const createdRaw = c.createdAt ?? c.launchedAt;
      let created: string | undefined;

      if (typeof createdRaw === "number")
        created = new Date(createdRaw).toISOString();
      else if (typeof createdRaw === "string") created = createdRaw;

      return {
        token_address: addr,
        name: c.name || "",
        symbol: c.symbol || "",
        source: "zora",
        source_url: `https://zora.co/collect/base:${addr}`,
        first_seen_at: created,
      } as Token;
    })
    .filter(Boolean) as Token[];

  return tokens.filter((t) => {
    const ts = new Date(t.first_seen_at || 0).getTime();
    return now - ts <= WINDOW_MS;
  });
}

// ======================= GeckoTerminal =======================

function toNum(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export async function enrichWithGeckoTerminal(
  tokens: Token[]
): Promise<TokenWithMarket[]> {
  const out: TokenWithMarket[] = [];

  for (const t of tokens) {
    try {
      const res = await fetch(`${GECKO_BASE_TOKENS}/${t.token_address}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        out.push({ ...t });
        continue;
      }

      const data = await res.json();
      const a = data?.data?.attributes || {};

      out.push({
        ...t,
        price_usd: toNum(a.price_usd),
        market_cap_usd: toNum(
          a.market_cap_usd ??
            a.fully_diluted_valuation_usd ??
            a.fdv_usd
        ),
        liquidity_usd: toNum(a.liquidity_usd ?? a.reserve_in_usd),
        volume_24h_usd: toNum(
          a.volume_usd?.h24 ??
            a.trade_volume_24h_usd ??
            a.volume_24h_usd
        ),
      });
    } catch {
      out.push({ ...t });
    }
  }

  return out;
}

// ======================= Aggregator =======================

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
