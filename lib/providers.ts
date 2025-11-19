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

// Zora Coins REST API
const ZORA_API_BASE = "https://api-sdk.zora.engineering/api";
const BASE_CHAIN_ID = 8453;

// Окно «новых» токенов — 3 часа
const NEW_WINDOW_MS = 3 * 60 * 60 * 1000;

// -------- Вспомогательные функции --------

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...(init || {}) });
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

// безопасный перевод в число
function toNum(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

// ======================= CLANKER (3 часа) =======================

export async function fetchTokensFromClanker(): Promise<Token[]> {
  const now = Date.now();
  const windowAgo = now - NEW_WINDOW_MS;
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
      if (t.chain_id && t.chain_id !== BASE_CHAIN_ID) return null; // только Base

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
    return now - ts <= NEW_WINDOW_MS;
  });
}

// ======================= ZORA (coins, 3 часа) =======================

export async function fetchTokensFromZora(): Promise<Token[]> {
  const now = Date.now();
  const windowAgo = now - NEW_WINDOW_MS;

  const headers: Record<string, string> = {};
  const apiKey = process.env.ZORA_API_KEY;
  if (apiKey) {
    headers["api-key"] = apiKey;
  }

  try {
    // максимально простой запрос: последние коины по сети Base
    const params = new URLSearchParams({
      chain: String(BASE_CHAIN_ID),
      limit: "200",
    });

    const url = `${ZORA_API_BASE}/coins?${params.toString()}`;
    const raw: any = await fetchJson(url, { headers });

    // форма ответа может быть разной, поэтому аккуратно:
    const list: any[] =
      (Array.isArray(raw?.coins) && raw.coins) ||
      (Array.isArray(raw?.data) && raw.data) ||
      (Array.isArray(raw) ? raw : []);

    const tokens: Token[] = list
      .map((c: any) => {
        const addr = (
          c.address ||
          c.contractAddress ||
          c.token_address ||
          ""
        )
          .toString()
          .toLowerCase();

        if (!addr) return null;

        // цепочка — на всякий случай оставим только Base
        const chainId = Number(
          c.chain_id ?? c.chain ?? c.network_id ?? BASE_CHAIN_ID
        );
        if (Number.isFinite(chainId) && chainId !== BASE_CHAIN_ID) {
          return null;
        }

        const name = (c.name || "").toString();
        const symbol = (c.symbol || "").toString();

        const created =
          c.createdAt ||
          c.created_at ||
          c.timestamp ||
          c.firstSeenAt ||
          undefined;

        const meta = c.metadata || {};
        const creator = c.creator || c.owner || c.profile || {};

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

        if (!farcasterUrl && username) {
          farcasterUrl = `https://farcaster.xyz/${username}`;
        }

        const token: Token = {
          token_address: addr,
          name,
          symbol,
          source: "zora",
          // canonical страница Zora для коинов на Base обычно в таком формате
          source_url: `https://zora.co/coins/base:${addr}`,
          first_seen_at: created,
          farcaster_url: farcasterUrl,
        };

        if (isBlockedCreator(token.farcaster_url)) return null;

        return token;
      })
      .filter(Boolean) as Token[];

    // фильтр по 3-часовому окну
    return tokens.filter((t) => {
      if (!t.first_seen_at) return true;
      const ts = new Date(t.first_seen_at).getTime();
      return now - ts <= NEW_WINDOW_MS;
    });
  } catch (e) {
    console.error("Zora fetch error", e);
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
    } catch {
      result.push({ ...t });
    }
  }

  return result;
}

// ======================= Агрегатор =======================

export async function getTokens(): Promise<TokenWithMarket[]> {
  // тянем Clanker и Zora параллельно
  const [clanker, zora] = await Promise.all([
    fetchTokensFromClanker(),
    fetchTokensFromZora(),
  ]);

  const merged: Token[] = [...clanker, ...zora];

  // дедуп по адресу (если один и тот же токен есть в двух источниках)
  const byAddress = new Map<string, Token>();
  for (const t of merged) {
    const key = t.token_address.toLowerCase();
    if (!byAddress.has(key)) {
      byAddress.set(key, t);
    }
  }

  const uniqueTokens = Array.from(byAddress.values());
  const withMarket = await enrichWithGeckoTerminal(uniqueTokens);
  return withMarket;
}
