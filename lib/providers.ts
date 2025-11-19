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

// Zora Coins API
const ZORA_BASE_URL = "https://api-sdk.zora.engineering";
const ZORA_API_KEY = ZORA_API_KEY;

// -------- Вспомогательные функции --------

async function fetchJson(url: string, options: RequestInit = {}) {
  const res = await fetch(url, { cache: "no-store", ...options });
  if (!res.ok) {
    throw new Error(`${url} ${res.status}`);
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

function toNum(x: any): number | null {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
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

// ======================= ZORA (3 часа, best-effort) =======================

export async function fetchTokensFromZora(): Promise<Token[]> {
  // Если нет API-ключа — просто не трогаем Zora, чтобы не спамить ошибками
  if (!ZORA_API_KEY) {
    return [];
  }

  const now = Date.now();
  const WINDOW_MS = 3 * 60 * 60 * 1000; // 3 часа
  const windowAgoISO = new Date(now - WINDOW_MS).toISOString();

  // Параметры максимально консервативные — последние монеты на Base
  const params = new URLSearchParams({
    chain: "8453",
    limit: "100",
    // многие REST-обёртки позволяют sort / direction, но если нет —
    // просто будут игнорироваться
    sort: "createdAt",
    direction: "desc",
  });

  const url = `${ZORA_BASE_URL}/coins?${params.toString()}`;

  try {
    const json: any = await fetchJson(url, {
      headers: {
        "api-key": ZORA_API_KEY,
      },
    });

    const rawCoins: any[] = Array.isArray(json?.coins)
      ? json.coins
      : Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json)
      ? json
      : [];

    const tokens: Token[] = rawCoins
      .map((c: any) => {
        // максимально аккуратно достаём контракт
        const addrRaw =
          c.address ||
          c.contractAddress ||
          c.tokenAddress ||
          c.token_address ||
          "";
        const addr = String(addrRaw || "").toLowerCase();
        if (!addr || !addr.startsWith("0x")) return null;

        const name =
          (c.name as string) ||
          (c.tokenName as string) ||
          (c.metadata && c.metadata.name) ||
          "";
        const symbol =
          (c.symbol as string) ||
          (c.tokenSymbol as string) ||
          (c.ticker as string) ||
          "";

        // createdAt / created_at / timestamp
        const createdRaw =
          c.createdAt || c.created_at || c.timestamp || c.blockTimestamp;
        const created =
          typeof createdRaw === "string" ? createdRaw : undefined;

        const allUrls = collectUrls(c);
        let farcasterUrl =
          allUrls.find((u) =>
            u.toLowerCase().includes("farcaster.xyz")
          ) || undefined;

        // базовый фронт для зора-коинов
        const sourceUrl = `https://zora.co/coins/base:${addr}`;

        const token: Token = {
          token_address: addr,
          name,
          symbol,
          source: "zora",
          source_url: sourceUrl,
          first_seen_at: created,
          farcaster_url: farcasterUrl,
        };

        if (isBlockedCreator(token.farcaster_url)) return null;

        return token;
      })
      .filter(Boolean) as Token[];

    // ограничиваем 3 часами, если есть createdAt
    return tokens.filter((t) => {
      if (!t.first_seen_at) return true;
      const ts = new Date(t.first_seen_at).getTime();
      if (Number.isNaN(ts)) return true;
      return ts >= new Date(windowAgoISO).getTime();
    });
  } catch (e) {
    console.error("Zora fetch error", e);
    // В случае любого фейла просто возвращаем пустой массив, чтобы не ломать Clanker
    return [];
  }
}

// ======================= GeckoTerminal =======================

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
    } catch (e) {
      console.error("GeckoTerminal fetch error", e);
      result.push({ ...t });
    }
  }

  return result;
}

// ======================= Агрегатор =======================

export async function getTokens(): Promise<TokenWithMarket[]> {
  // грузим Clanker и Zora параллельно
  const [clanker, zora] = await Promise.all([
    fetchTokensFromClanker(),
    fetchTokensFromZora(),
  ]);

  // мержим по адресу, чтобы не было дублей
  const byAddr = new Map<string, Token>();

  for (const t of [...clanker, ...zora]) {
    const key = t.token_address.toLowerCase();
    if (!byAddr.has(key)) {
      byAddr.set(key, t);
    }
  }

  const merged = Array.from(byAddr.values());

  // обогащаем маркет-данными
  const withMarket = await enrichWithGeckoTerminal(merged);
  return withMarket;
}
