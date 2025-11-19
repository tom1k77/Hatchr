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

// Zora REST
const ZORA_BASE_URL = "https://api-sdk.zora.engineering/api";

// -------- Вспомогательные функции --------

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
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

// ======================= ZORA (через /coins) =======================

export async function fetchTokensFromZora(): Promise<Token[]> {
  const apiKey = process.env.ZORA_API_KEY;
  if (!apiKey) {
    console.warn("Zora: ZORA_API_KEY is not set, skipping Zora tokens");
    return [];
  }

  const now = Date.now();
  const WINDOW_MS = 3 * 60 * 60 * 1000; // те же 3 часа

  try {
    // Без лишних параметров — берём дефолтный список /coins
    const res = await fetch(`${ZORA_BASE_URL}/coins`, {
      cache: "no-store",
      headers: {
        "api-key": apiKey,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        "Zora fetch error",
        res.status,
        res.statusText,
        text.slice(0, 400)
      );
      return [];
    }

    const data: any = await res.json();

    // Пытаемся найти массив монет
    const rawCoins: any[] =
      (Array.isArray(data?.coins) && data.coins) ||
      (Array.isArray(data?.items) && data.items) ||
      (Array.isArray(data?.data) && data.data) ||
      [];

    const tokens: Token[] = rawCoins
      .map((c: any) => {
        // адрес токена — пробуем несколько вариантов
        const addrRaw =
          c.address ||
          c.token_address ||
          c.tokenAddress ||
          c.contract_address ||
          c.contractAddress ||
          "";

        const addr = String(addrRaw || "").toLowerCase();
        if (!addr.startsWith("0x") || addr.length < 10) return null;

        // chain / network
        const chainId =
          c.chainId ||
          c.chain_id ||
          c.network?.chainId ||
          c.network?.chain_id ||
          c.chain;

        if (chainId && Number(chainId) !== 8453) {
          // оставляем только Base
          return null;
        }

        const name = (c.name || "").toString();
        const symbol = (c.symbol || "").toString();

        const createdRaw =
          c.createdAt ||
          c.created_at ||
          c.timeCreated ||
          c.timestamp ||
          undefined;

        const creator = c.creator || c.profile || {};
        const urls = collectUrls(c);

        let farcasterUrl =
          urls.find((u) =>
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

        if (!farcasterUrl && username) {
          farcasterUrl = `https://farcaster.xyz/${username}`;
        }

        const firstSeen = createdRaw ? String(createdRaw) : undefined;

        const token: Token = {
          token_address: addr,
          name,
          symbol,
          source: "zora",
          source_url: `https://zora.co/coins/${addr}`, // базовая ссылка на Zora coin
          first_seen_at: firstSeen,
          farcaster_url: farcasterUrl,
        };

        if (isBlockedCreator(token.farcaster_url)) return null;

        return token;
      })
      .filter(Boolean) as Token[];

    // фильтр по 3-часовому окну, если есть дата
    return tokens.filter((t) => {
      if (!t.first_seen_at) return true;
      const ts = new Date(t.first_seen_at).getTime();
      if (Number.isNaN(ts)) return true;
      return now - ts <= WINDOW_MS;
    });
  } catch (e) {
    console.error("Zora fetch error (exception)", e);
    return [];
  }
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

      const volume24 =
