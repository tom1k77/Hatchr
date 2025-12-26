// lib/providers.ts

// -------- Types --------

export interface Token {
  token_address: string;
  name?: string;
  symbol?: string;
  source?: string;
  source_url?: string;
  first_seen_at?: string;
  image_url?: string | null;

  // socials (TOKEN)
  farcaster_url?: string; // creator only
  farcaster_fid?: number | null;

  website_url?: string;
  x_url?: string;
  telegram_url?: string;
  instagram_url?: string;
  tiktok_url?: string;

  // fallback numbers from Zora (if Gecko doesn't know the token)
  zora_price_usd?: number | null;
  zora_market_cap_usd?: number | null;
  zora_volume_24h_usd?: number | null;

  // ✅ fallback numbers from Clanker (if Gecko doesn't know the token)
  clanker_price_usd?: number | null;
  clanker_market_cap_usd?: number | null;
  clanker_liquidity_usd?: number | null;
  clanker_volume_24h_usd?: number | null;
}

export interface TokenWithMarket extends Token {
  price_usd?: number | null;
  market_cap_usd?: number | null;
  liquidity_usd?: number | null;
  volume_24h_usd?: number | null;
}

// --- Farcaster bots blacklist ---
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

// -------- Const --------

const CLANKER_API = "https://www.clanker.world/api/tokens";
const CLANKER_FRONT = "https://www.clanker.world";

// GeckoTerminal: Base network
const GECKO_BASE_TOKEN = "https://api.geckoterminal.com/api/v2/networks/base/tokens";

// Zora SDK base URL
const ZORA_BASE_URL = "https://api-sdk.zora.engineering";
const ZORA_API_KEY = process.env.ZORA_API_KEY;

// -------- Shared helpers --------

function toNum(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function fetchJsonSafe(url: string, timeoutMs = 8000): Promise<any | null> {
  try {
    const res = await fetchWithTimeout(url, undefined, timeoutMs);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchJsonZora(path: string, params: Record<string, string>) {
  if (!ZORA_API_KEY) return null;

  const url = new URL(path, ZORA_BASE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  try {
    const res = await fetchWithTimeout(
      url.toString(),
      {
        headers: {
          "api-key": ZORA_API_KEY,
          accept: "application/json",
        },
      },
      10000
    );

    if (!res.ok) return null;

    try {
      return await res.json();
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

// limit log spam (module-scope)
let clankerErrCount = 0;
let clankerLastLogAt = 0;

function logClankerOncePer30s(...args: any[]) {
  const now = Date.now();
  clankerErrCount += 1;

  // log максимум раз в 30 секунд, чтобы Vercel logs не превращались в ад
  if (now - clankerLastLogAt > 30_000) {
    clankerLastLogAt = now;
    console.error(...args, `(err_count=${clankerErrCount})`);
  }
}

// recursively collect urls from metadata
function collectUrls(obj: any, depth = 0, acc: string[] = []): string[] {
  if (!obj || depth > 6) return acc;

  if (typeof obj === "string") {
    const s = obj.trim();
    if (s.startsWith("http://") || s.startsWith("https://")) acc.push(s);
    return acc;
  }

  if (Array.isArray(obj)) {
    for (const v of obj) collectUrls(v, depth + 1, acc);
    return acc;
  }

  if (typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      collectUrls((obj as any)[key], depth + 1, acc);
    }
  }

  return acc;
}

// image normalization (ipfs, etc.)
function normalizeImageUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("ipfs://")) {
    const hash = trimmed.replace("ipfs://", "");
    return `https://ipfs.io/ipfs/${hash}`;
  }

  const ipfsMatch = trimmed.match(/ipfs\/([^/?#]+)/);
  if (ipfsMatch?.[1]) {
    return `https://ipfs.io/ipfs/${ipfsMatch[1]}`;
  }

  return trimmed;
}

/**
 * ✅ deep numeric lookup.
 * Clanker часто меняет форму payload — поэтому ищем числа по списку возможных ключей на любом уровне.
 */
function pickNumberDeep(obj: any, keys: string[], maxDepth = 6): number | null {
  const seen = new Set<any>();

  function walk(o: any, depth: number): number | null {
    if (!o || depth > maxDepth) return null;
    if (typeof o !== "object") return null;
    if (seen.has(o)) return null;
    seen.add(o);

    // прямые ключи
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(o, k)) {
        const v = toNum((o as any)[k]);
        if (v != null && v > 0) return v;
      }
    }

    // вложенные объекты/массивы
    if (Array.isArray(o)) {
      for (const it of o) {
        const got = walk(it, depth + 1);
        if (got != null) return got;
      }
      return null;
    }

    for (const k of Object.keys(o)) {
      const got = walk((o as any)[k], depth + 1);
      if (got != null) return got;
    }
    return null;
  }

  return walk(obj, 0);
}

// ======================= Market cache (module-scope) =======================

type MarketSnap = {
  ts: number;
  price_usd: number | null;
  market_cap_usd: number | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
};

const marketCache = new Map<string, MarketSnap>();

const MARKET_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function getCachedMarket(addr: string): MarketSnap | null {
  const v = marketCache.get(addr);
  if (!v) return null;
  if (Date.now() - v.ts > MARKET_CACHE_TTL_MS) {
    marketCache.delete(addr);
    return null;
  }
  return v;
}

function saveCachedMarket(addr: string, snap: Omit<MarketSnap, "ts">) {
  const hasAny =
    (snap.price_usd ?? 0) > 0 ||
    (snap.market_cap_usd ?? 0) > 0 ||
    (snap.liquidity_usd ?? 0) > 0 ||
    (snap.volume_24h_usd ?? 0) > 0;

  if (!hasAny) return;
  marketCache.set(addr, { ts: Date.now(), ...snap });
}

// ======================= NEW TOKEN INGEST (module-scope) =======================
// Дергаем /api/notify/on-new-token при появлении "свежих" токенов.
// Включается флагом ENABLE_ON_NEW_TOKEN_INGEST=1 (иначе не делает ничего).

const ENABLE_ON_NEW_TOKEN_INGEST = process.env.ENABLE_ON_NEW_TOKEN_INGEST === "1";

// ✅ IMPORTANT: use same env as your route expects
const INGEST_SECRET = (process.env.INGEST_SECRET || "").trim();

// дедуп в рамках одного инстанса (на hobby может быть несколько инстансов, поэтому основная дедуп должна быть в Neon)
const seenNewToken = new Map<string, number>();
const SEEN_TTL_MS = 60 * 60 * 1000; // 1 час

function rememberSeen(addr: string) {
  const now = Date.now();
  seenNewToken.set(addr, now);
  for (const [k, ts] of seenNewToken) {
    if (now - ts > SEEN_TTL_MS) seenNewToken.delete(k);
  }
}

function wasSeen(addr: string) {
  const ts = seenNewToken.get(addr);
  if (!ts) return false;
  return Date.now() - ts <= SEEN_TTL_MS;
}

function getSiteUrl(): string | null {
  // приоритет: SITE_URL -> NEXT_PUBLIC_SITE_URL -> VERCEL_URL
  const s =
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const site = (s || "").trim();
  if (!site) return null;
  return site.startsWith("http") ? site : `https://${site}`;
}

function parseTs(first_seen_at?: string) {
  if (!first_seen_at) return null;
  const ts = new Date(first_seen_at).getTime();
  return Number.isNaN(ts) ? null : ts;
}

// "свежий" — в окне 10 минут
const FRESH_WINDOW_MS = 10 * 60 * 1000;

function isFreshToken(t: Token) {
  const ts = parseTs(t.first_seen_at);
  if (ts == null) return true;
  return Date.now() - ts <= FRESH_WINDOW_MS;
}

async function postOnNewToken(t: Token) {
  const site = getSiteUrl();
  if (!site) return;

  // if you enabled ingest but forgot secret — don't spam 401
  if (!INGEST_SECRET) {
    console.error("[ingest][on-new-token] missing INGEST_SECRET env (set it in Vercel)");
    return;
  }

  const url = `${site}/api/notify/on-new-token`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-ingest-secret": INGEST_SECRET,
  };

  const payload = {
    token_address: t.token_address,
    name: t.name || null,
    symbol: t.symbol || null,
    source: t.source || null,
    source_url: t.source_url || null,
    first_seen_at: t.first_seen_at || null,
    farcaster_url: t.farcaster_url || null,
    farcaster_fid: t.farcaster_fid ?? null,
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("[ingest][on-new-token] failed:", res.status, txt.slice(0, 300));
    }
  } catch (e: any) {
    console.error("[ingest][on-new-token] error:", e?.message ?? String(e));
  }
}

async function ingestNewTokens(tokens: Token[]) {
  if (!ENABLE_ON_NEW_TOKEN_INGEST) return;

  const fresh = tokens.filter((t) => t?.token_address && isFreshToken(t));

  // ограничим отправку на один прогон, чтобы не заспамить себя на cold start
  const LIMIT = 25;
  let sent = 0;

  for (const t of fresh) {
    const addr = (t.token_address || "").toLowerCase();
    if (!addr) continue;

    if (wasSeen(addr)) continue;
    rememberSeen(addr);

    await postOnNewToken(t);
    sent += 1;
    if (sent >= LIMIT) break;
  }
}

// ======================= CLANKER (12 hours) =======================

export async function fetchTokensFromClanker(): Promise<Token[]> {
  const now = Date.now();
  const WINDOW_MS = 12 * 60 * 60 * 1000; // 12 hours
  const windowAgo = now - WINDOW_MS;
  const startDateUnix = Math.floor(windowAgo / 1000);

  let cursor: string | undefined = undefined;
  const collected: any[] = [];

  const MAX_PAGES = 15; // about 300 tokens
  let consecutiveFails = 0;

  for (let i = 0; i < MAX_PAGES; i++) {
    const params = new URLSearchParams({
      limit: "20",
      sort: "desc",
      startDate: String(startDateUnix),
      includeUser: "true",

      // ✅ FIX: try multiple variants that Clanker could support
      includeMarket: "1",
      includeMarketData: "1",
      include_market: "1",
    });

    if (cursor) params.set("cursor", cursor);

    const url = `${CLANKER_API}?${params.toString()}`;

    const raw = await fetchJsonSafe(url, 8000);

    if (!raw) {
      consecutiveFails += 1;
      logClankerOncePer30s("[Clanker] fetch error, skip page:", url);

      if (consecutiveFails >= 2) break;
      await sleep(300);
      continue;
    }

    consecutiveFails = 0;

    const data: any[] = Array.isArray(raw?.data) ? raw.data : [];
    if (!data.length) break;

    collected.push(...data);
    cursor = raw?.cursor;
    if (!cursor) break;
  }

  const tokens: Token[] = collected
    .map((t: any) => {
      if (t.chain_id && t.chain_id !== 8453) return null; // Base only

      const addr = (t.contract_address || "").toString().toLowerCase();
      if (!addr) return null;

      const name = (t.name || "").toString();
      const symbol = (t.symbol || "").toString();

      const meta = t.metadata || {};
      const creator = t.related?.user || {};

      const cl_price = pickNumberDeep(t, ["price_usd", "priceUsd", "token_price_usd", "tokenPriceUsd", "price", "tokenPrice"]);

      const cl_mcap = pickNumberDeep(t, [
        "market_cap_usd",
        "marketCapUsd",
        "market_cap",
        "marketCap",
        "fdv_usd",
        "fdv",
        "fully_diluted_valuation_usd",
        "fullyDilutedValuationUsd",
      ]);

      const cl_liq = pickNumberDeep(t, ["liquidity_usd", "liquidityUsd", "liquidity", "reserve_in_usd", "reserveUsd", "reserve"]);

      const cl_vol24 = pickNumberDeep(t, [
        "volume_24h_usd",
        "volume24hUsd",
        "volume24h",
        "trade_volume_24h_usd",
        "tradeVolume24hUsd",
        "volume_usd_24h",
        "volumeUsd24h",
      ]);

      const rawImage: string | null =
        (t.img_url as string | undefined) ||
        (t.image_url as string | undefined) ||
        (t.imageUrl as string | undefined) ||
        (t.image as string | undefined) ||
        (t.thumbnailUrl as string | undefined) ||
        (meta.img_url as string | undefined) ||
        (meta.image_url as string | undefined) ||
        (meta.imageUrl as string | undefined) ||
        (meta.image as string | undefined) ||
        (meta.thumbnailUrl as string | undefined) ||
        null;

      const image_url = normalizeImageUrl(rawImage);

      let fid: number | string | undefined;
      if (Array.isArray(t.fids) && t.fids.length > 0) fid = t.fids[0];
      else if (typeof t.fid !== "undefined") fid = t.fid;

      const rawUsername = creator.fname || creator.username || creator.handle || creator.name || "";
      const username = typeof rawUsername === "string" ? rawUsername.replace(/^@/, "").trim() : "";

      let farcasterUrl: string | undefined;
      if (username) farcasterUrl = `https://warpcast.com/${username}`;
      else if (typeof fid !== "undefined") farcasterUrl = `https://farcaster.xyz/profiles/${fid}`;

      let farcaster_fid_raw: number | null = null;
      if (typeof fid === "number" && Number.isFinite(fid)) farcaster_fid_raw = fid;
      else if (typeof fid === "string") {
        const parsed = Number(fid);
        if (Number.isFinite(parsed)) farcaster_fid_raw = parsed;
      }

      const urlsMeta = collectUrls(meta);

      let website_url: string | undefined;
      let x_url: string | undefined;
      let telegram_url: string | undefined;
      let instagram_url: string | undefined;
      let tiktok_url: string | undefined;

      for (const u of urlsMeta) {
        try {
          const parsed = new URL(u);
          const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

          if (host === "warpcast.com" || host === "farcaster.xyz" || host.endsWith("farcaster.xyz")) continue;

          if (!x_url && (host === "x.com" || host === "twitter.com")) {
            x_url = u;
            continue;
          }
          if (!telegram_url && (host === "t.me" || host === "telegram.me" || host === "telegram.org")) {
            telegram_url = u;
            continue;
          }
          if (!instagram_url && host === "instagram.com") {
            instagram_url = u;
            continue;
          }
          if (!tiktok_url && host === "tiktok.com") {
            tiktok_url = u;
            continue;
          }
          if (!website_url) website_url = u;
        } catch {}
      }

      const firstSeen = t.created_at || t.deployed_at || t.last_indexed || undefined;

      const token: Token = {
        token_address: addr,
        name,
        symbol,
        source: "clanker",
        source_url: `${CLANKER_FRONT}/clanker/${addr}`,
        image_url,
        first_seen_at: firstSeen,

        farcaster_url: farcasterUrl,
        farcaster_fid: farcaster_fid_raw,

        website_url,
        x_url,
        telegram_url,
        instagram_url,
        tiktok_url,

        clanker_price_usd: cl_price,
        clanker_market_cap_usd: cl_mcap,
        clanker_liquidity_usd: cl_liq,
        clanker_volume_24h_usd: cl_vol24,
      };

      if (isBlockedCreator(token.farcaster_url)) return null;
      return token;
    })
    .filter(Boolean) as Token[];

  return tokens.filter((t) => {
    if (!t.first_seen_at) return true;
    const ts = new Date(t.first_seen_at).getTime();
    return now - ts <= WINDOW_MS;
  });
}

// ======================= ZORA =======================

export async function fetchTokensFromZora(): Promise<Token[]> {
  const now = Date.now();
  const WINDOW_MS = 12 * 60 * 60 * 1000; // 12 hours

  if (!ZORA_API_KEY) return [];

  const tokens: Token[] = [];
  let cursor: string | undefined = undefined;

  const PAGE_SIZE = 50;
  const MAX_PAGES = 20;

  for (let i = 0; i < MAX_PAGES; i++) {
    const params: Record<string, string> = {
      listType: "NEW_CREATORS",
      count: String(PAGE_SIZE),
    };
    if (cursor) params.after = cursor;

    const json = await fetchJsonZora("/explore", params);
    const edges: any[] = Array.isArray(json?.exploreList?.edges) ? json.exploreList.edges : [];

    if (!edges.length) break;

    for (const edge of edges) {
      const n = edge?.node;
      if (!n) continue;

      if (n.chainId && n.chainId !== 8453) continue; // Base only

      const addr = (n.address || "").toString().toLowerCase();
      if (!addr) continue;

      const name = (n.name || "").toString();
      const symbol = (n.symbol || "").toString();

      const createdRaw = n.createdAt ?? null;
      let createdIso: string | undefined;
      if (typeof createdRaw === "string" && createdRaw) {
        const normalized = createdRaw.endsWith("Z") || createdRaw.endsWith("z") ? createdRaw : createdRaw + "Z";
        const d = new Date(normalized);
        if (!Number.isNaN(d.getTime())) createdIso = d.toISOString();
      }

      const marketCapNum = toNum(n.marketCap);
      const volume24Num = toNum(n.volume24h);
      const priceUsdcNum = toNum(n.tokenPrice?.priceInUsdc);

      const social = n.creatorProfile?.socialAccounts ?? {};
      let farcaster_url: string | undefined;
      let x_url: string | undefined;
      let instagram_url: string | undefined;
      let tiktok_url: string | undefined;

      if (social.farcaster?.username) farcaster_url = `https://warpcast.com/${social.farcaster.username}`;
      if (social.twitter?.username) x_url = `https://x.com/${social.twitter.username}`;
      if (social.instagram?.username) instagram_url = `https://instagram.com/${social.instagram.username}`;
      if (social.tiktok?.username) tiktok_url = `https://www.tiktok.com/@${social.tiktok.username}`;

      const source_url = `https://zora.co/coin/base:${addr}`;

      const rawImage: string | null =
        (n.imageUrl as string | undefined) ||
        (n.image_url as string | undefined) ||
        (n.image?.url as string | undefined) ||
        (Array.isArray(n.media) && n.media[0]?.url ? (n.media[0].url as string) : undefined) ||
        (n.creatorProfile?.avatar?.previewImage?.url as string | undefined) ||
        (n.creatorProfile?.avatar?.url as string | undefined) ||
        null;

      const image_url = normalizeImageUrl(rawImage);

      tokens.push({
        token_address: addr,
        name,
        symbol,
        source: "zora",
        source_url,
        first_seen_at: createdIso,
        image_url,
        farcaster_url,
        x_url,
        instagram_url,
        tiktok_url,
        zora_price_usd: priceUsdcNum,
        zora_market_cap_usd: marketCapNum,
        zora_volume_24h_usd: volume24Num,
      });
    }

    cursor = json?.exploreList?.pageInfo?.endCursor;
    const hasNextPage = Boolean(json?.exploreList?.pageInfo?.hasNextPage);
    if (!hasNextPage) break;
  }

  return tokens.filter((t) => {
    if (!t.first_seen_at) return true;
    const ts = new Date(t.first_seen_at).getTime();
    return now - ts <= WINDOW_MS;
  });
}

// ======================= GeckoTerminal enrich =======================

async function enrichOneWithGecko(t: Token): Promise<TokenWithMarket> {
  const addr = (t.token_address || "").toLowerCase();
  const cached = addr ? getCachedMarket(addr) : null;

  try {
    const url = `${GECKO_BASE_TOKEN}/${addr}`;
    const res = await fetchWithTimeout(url, undefined, 8000);

    let price: number | null = null;
    let marketCap: number | null = null;
    let liquidity: number | null = null;
    let volume24: number | null = null;

    if (res.ok) {
      const data: any = await res.json().catch(() => null);
      const attr = data?.data?.attributes || {};

      price = toNum(attr.price_usd);

      marketCap = toNum(
        attr.market_cap_usd ?? attr.fully_diluted_valuation_usd ?? attr.fully_diluted_valuation ?? attr.fdv_usd
      );

      liquidity = toNum(attr.liquidity_usd ?? attr.reserve_in_usd);

      volume24 = toNum(attr.volume_usd?.h24 ?? attr.trade_volume_24h_usd ?? attr.trade_volume_24h ?? attr.volume_24h_usd);
    }

    if (t.source === "zora") {
      if (price == null || price === 0) price = toNum((t as any).zora_price_usd);
      if (marketCap == null || marketCap === 0) marketCap = toNum((t as any).zora_market_cap_usd);
      if (volume24 == null || volume24 === 0) volume24 = toNum((t as any).zora_volume_24h_usd);
    }

    if (t.source === "clanker") {
      if (price == null || price === 0) price = toNum((t as any).clanker_price_usd);
      if (marketCap == null || marketCap === 0) marketCap = toNum((t as any).clanker_market_cap_usd);
      if (liquidity == null || liquidity === 0) liquidity = toNum((t as any).clanker_liquidity_usd);
      if (volume24 == null || volume24 === 0) volume24 = toNum((t as any).clanker_volume_24h_usd);
    }

    const filled = {
      price_usd: price == null || price === 0 ? cached?.price_usd ?? null : price,
      market_cap_usd: marketCap == null || marketCap === 0 ? cached?.market_cap_usd ?? null : marketCap,
      liquidity_usd: liquidity == null || liquidity === 0 ? cached?.liquidity_usd ?? null : liquidity,
      volume_24h_usd: volume24 == null || volume24 === 0 ? cached?.volume_24h_usd ?? null : volume24,
    };

    if (addr) saveCachedMarket(addr, filled);
    return { ...t, ...filled };
  } catch {
    if (cached) {
      return { ...t, price_usd: cached.price_usd, market_cap_usd: cached.market_cap_usd, liquidity_usd: cached.liquidity_usd, volume_24h_usd: cached.volume_24h_usd };
    }
    return { ...t };
  }
}

export async function enrichWithGeckoTerminal(tokens: Token[]): Promise<TokenWithMarket[]> {
  const CONCURRENCY = 5;
  const out: TokenWithMarket[] = [];
  let i = 0;

  while (i < tokens.length) {
    const chunk = tokens.slice(i, i + CONCURRENCY);
    const enriched = await Promise.all(chunk.map(enrichOneWithGecko));
    out.push(...enriched);
    i += CONCURRENCY;
  }

  return out;
}

// ======================= Aggregator =======================

export async function getTokens(): Promise<TokenWithMarket[]> {
  const [clankerRes, zoraRes] = await Promise.allSettled([fetchTokensFromClanker(), fetchTokensFromZora()]);

  const clanker = clankerRes.status === "fulfilled" ? clankerRes.value : [];
  const zora = zoraRes.status === "fulfilled" ? zoraRes.value : [];

  const all: Token[] = [...clanker, ...zora];

  const byAddress = new Map<string, Token>();
  for (const t of all) {
    const key = t.token_address.toLowerCase();
    if (!byAddress.has(key)) {
      byAddress.set(key, t);
    } else {
      const prev = byAddress.get(key)!;
      if (prev.source !== "clanker" && t.source === "clanker") {
        byAddress.set(key, t);
      }
    }
  }

  const merged = Array.from(byAddress.values());

  // ✅ emit "new token" events (guarded by ENABLE_ON_NEW_TOKEN_INGEST=1)
  await ingestNewTokens(merged);

  const withMarket = await enrichWithGeckoTerminal(merged);
  return withMarket;
}
