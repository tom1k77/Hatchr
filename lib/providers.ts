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

// GeckoTerminal: сеть Base
const GECKO_BASE_TOKENS =
  "https://api.geckoterminal.com/api/v2/networks/base/tokens";

// Zora Coins SDK
const ZORA_API = "https://api-sdk.zora.engineering/api";
const ZORA_API_KEY = process.env.ZORA_API_KEY;

// -------- Вспомогательные функции --------

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

// Zora с api-key
async function fetchZoraJson(pathWithQuery: string) {
  if (!ZORA_API_KEY) {
    console.warn("[Hatchr] ZORA_API_KEY is not set, skipping Zora requests");
    throw new Error("Zora API key missing");
  }

  const url = `${ZORA_API}${pathWithQuery}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      "api-key": ZORA_API_KEY,
    },
  });

  if (!res.ok) {
    throw new Error(`Zora ${pathWithQuery} ${res.status}`);
  }
  return res.json();
}

// Рекурсивно собираем все URL
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

// ======================= CLANKER (3 часа) =======================

export async function fetchTokensFromClanker(): Promise<Token[]> {
  const now = Date.now();
  const WINDOW_MS = 3 * 60 * 60 * 1000; // 3 часа
  const windowAgo = now - WINDOW_MS;
  const startDateUnix = Math.floor(windowAgo / 1000);

  let cursor: string | undefined = undefined;
  const collected: any[] = [];
  const MAX_PAGES = 15; // до ~300 токенов

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
    const raw: any = await fetchJson(url);

    const data: any[] = Array.isArray(raw?.data) ? raw.data : [];
    if (!data.length) break;

    collected.push(...data);
    cursor = raw?.cursor;
    if (!cursor) break;
  }

  const tokens: Token[] = collected
    .map((t: any) => {
      if (t.chain_id && t.chain_id !== 8453) return null; // только Base

      const addr = (t.contract_address || "").toString().toLowerCase();
      if (!addr) return null;

      const name = (t.name || "").toString();
      const symbol = (t.symbol || "").toString();

      const meta = t.metadata || {};
      const creator = t.related?.user || {};

      // fids / fid
      let fid: number | string | undefined;
      if (Array.isArray(t.fids) && t.fids.length > 0) {
        fid = t.fids[0];
      } else if (typeof t.fid !== "undefined") {
        fid = t.fid;
      }

      const urlsMeta = collectUrls(meta);
      const urlsCreator = collectUrls(creator);
      const allUrls = [...urlsMeta, ...urlsCreator];

      let farcasterUrl =
        allUrls.find((u) =>
          u.toLowerCase().includes("farcaster.xyz")
        ) || undefined;

      const rawUsername =
        creator.username ||
        creator.handle ||
        creator.fname ||
        creator.name ||
        "";

      const username =
        typeof rawUsername === "string"
          ? rawUsername.replace(/^@/, "").trim()
          : "";

      if (!farcasterUrl) {
        if (username) {
          farcasterUrl = `https://farcaster.xyz/${username}`;
        } else if (typeof fid !== "undefined") {
          farcasterUrl = `https://farcaster.xyz/profiles/${fid}`;
        }
      }

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

      if (isBlockedCreator(token.farcaster_url)) return null;

      return token;
    })
    .filter(Boolean) as Token[];

  // фильтр 3 часа на всякий случай
  return tokens.filter((t) => {
    if (!t.first_seen_at) return true;
    const ts = new Date(t.first_seen_at).getTime();
    return now - ts <= WINDOW_MS;
  });
}

// ======================= ZORA (3 часа) =======================

export async function fetchTokensFromZora(): Promise<Token[]> {
  // если ключа нет – просто возвращаем пустой массив, чтобы ничего не ломать
  if (!ZORA_API_KEY) {
    console.warn("[Hatchr] ZORA_API_KEY is not set, skipping Zora tokens");
    return [];
  }

  const now = Date.now();
  const WINDOW_MS = 3 * 60 * 60 * 1000; // 3 часа
  const windowAgo = now - WINDOW_MS;

  // простой вариант: берём последние N монет на Base
  // (точные параметры смотри в swagger /coins; limit можно подрегулировать)
  const query = `?/coins?chain=8453&limit=200`;
  const raw: any = await fetchZoraJson(query);

  const list: any[] =
    Array.isArray(raw?.coins) ||
    Array.isArray(raw?.items) ||
    Array.isArray(raw?.data)
      ? (raw.coins || raw.items || raw.data)
      : [];

  const tokens: Token[] = list
    .map((c: any) => {
      const addr =
        (c.address ||
          c.contractAddress ||
          c.tokenAddress ||
          "").toString().toLowerCase();
      if (!addr) return null;

      const name = (c.name || "").toString();
      const symbol = (c.symbol || "").toString();

      const meta = c.metadata || {};
      const creator = c.creator || {};

      const urlsMeta = collectUrls(meta);
      const urlsCreator = collectUrls(creator);
      const allUrls = [...urlsMeta, ...urlsCreator];

      let farcasterUrl =
        allUrls.find((u) =>
          u.toLowerCase().includes("farcaster.xyz")
        ) || undefined;

      const rawHandle =
        creator.handle ||
        creator.username ||
        creator.fname ||
        creator.name ||
        "";

      const username =
        typeof rawHandle === "string"
          ? rawHandle.replace(/^@/, "").trim()
          : "";

      if (!farcasterUrl && username) {
        farcasterUrl = `https://farcaster.xyz/${username}`;
      }

      const firstSeen =
        c.createdAt ||
        c.deployedAt ||
        c.firstTradeAt ||
        c.created_at ||
        undefined;

      const token: Token = {
        token_address: addr,
        name,
        symbol,
        source: "zora",
        source_url: `https://zora.co/coins/${addr}?network=base`,
        first_seen_at: firstSeen,
        farcaster_url: farcasterUrl,
      };

      if (isBlockedCreator(token.farcaster_url)) return null;

      return token;
    })
    .filter(Boolean) as Token[];

  // фильтр по окну 3 часа (если есть таймстемп)
  return tokens.filter((t) => {
    if (!t.first_seen_at) return true;
    const ts = new Date(t.first_seen_at).getTime();
    if (!Number.isFinite(ts)) return true;
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
  const result: TokenWithMarket[] = [];

  for (const t of tokens) {
    try {
      const res = await fetch(`${GECKO_BASE_TOKENS}/${t.token_address}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        result.push({ ...t });
        continue;
      }

      const data: any = await res.json();
      const attr = data?.data?.attributes || {};

      const price = toNum(attr.price_usd);

      const marketCap = toNum(
        attr.market_cap_usd ??
          attr.fully_diluted_valuation_usd ??
          attr.fully_diluted_valuation ??
          attr.fdv_usd
      );

      const liquidity = toNum(attr.liquidity_usd ?? attr.reserve_in_usd);

      const volume24 = toNum(
        attr.volume_usd?.h24 ??
          attr.trade_volume_24h_usd ??
          attr.trade_volume_24h ??
          attr.volume_24h_usd
      );

      result.push({
        ...t,
        price_usd: price,
        market_cap_usd: marketCap,
        liquidity_usd: liquidity,
        volume_24h_usd: volume24,
      });
    } catch {
      result.push({ ...t });
    }
  }

  return result;
}

// ======================= Агрегатор =======================

export async function getTokens(): Promise<TokenWithMarket[]> {
  // 1) Clanker
  const clanker = await fetchTokensFromClanker();

  // 2) Zora (если ключ есть; ошибки не ломают весь API)
  let zora: Token[] = [];
  try {
    zora = await fetchTokensFromZora();
  } catch (e) {
    console.error("[Hatchr] Zora fetch error", e);
  }

  // 3) склеиваем и убираем дубли по адресу
  const mergedMap = new Map<string, Token>();
  for (const t of [...clanker, ...zora]) {
    mergedMap.set(t.token_address.toLowerCase(), t);
  }
  const mergedTokens = Array.from(mergedMap.values());

  // 4) подливаем маркет-данные из GeckoTerminal
  const withMarket = await enrichWithGeckoTerminal(mergedTokens);
  return withMarket;
}
