// lib/providers.ts

// -------- Типы --------

export interface Token {
  token_address: string;
  name?: string;
  symbol?: string;
  source?: string;
  source_url?: string;
  first_seen_at?: string | null;

  // socials
  farcaster_url?: string | null;
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

// Zora SDK (публичный REST, как в доке swagger)
// пример из доки: https://api-sdk.zora.engineering/explore?listType=NEW_CREATORS&count=10
const ZORA_SDK_BASE = "https://api-sdk.zora.engineering";

// -------- Вспомогательные функции --------

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

// Рекурсивно собираем все URL (используем для Clanker-метаданных)
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
    let raw: any;
    try {
      raw = await fetchJson(url);
    } catch (e) {
      console.error("[Clanker] fetch error", e);
      break;
    }

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

// ======================= ZORA (3 часа, /explore NEW_CREATORS) =======================

export async function fetchTokensFromZora(): Promise<Token[]> {
  const now = Date.now();
  const WINDOW_MS = 3 * 60 * 60 * 1000; // те же 3 часа

  try {
    const url = new URL("/explore", ZORA_SDK_BASE);
    url.searchParams.set("listType", "NEW_CREATORS");
    url.searchParams.set("count", "200");

    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        "[Zora] /explore error",
        res.status,
        res.statusText,
        "Body:",
        text.slice(0, 200)
      );
      return [];
    }

    const json: any = await res.json();
    const edges: any[] = json?.exploreList?.edges ?? [];
    if (!Array.isArray(edges) || edges.length === 0) return [];

    const tokens: Token[] = edges
      .map((edge) => {
        const node = edge?.node;
        if (!node) return null;

        // берём только Base
        if (node.chainId && node.chainId !== 8453) return null;

        const addr = (node.address || "").toString().toLowerCase();
        if (!addr) return null;

        const name = (node.name || "").toString();
        const symbol = (node.symbol || "").toString();

        const createdAt =
          (node.createdAt && node.createdAt.toString()) || null;

        const profile = node.creatorProfile || {};
        const handle = (profile.handle || "").toString().replace(/^@/, "");
        const farcasterUsername =
          profile.socialAccounts?.farcaster?.username || "";

        let farcasterUrl: string | null = null;
        if (farcasterUsername) {
          farcasterUrl = `https://farcaster.xyz/${farcasterUsername}`;
        } else if (handle) {
          farcasterUrl = `https://farcaster.xyz/${handle}`;
        }

        const token: Token = {
          token_address: addr,
          name,
          symbol,
          source: "zora",
          source_url: `https://zora.co/coins/base:${addr}`,
          first_seen_at: createdAt,
          farcaster_url: farcasterUrl,
        };

        if (isBlockedCreator(token.farcaster_url)) return null;

        return token;
      })
      .filter(Boolean) as Token[];

    // фильтр по 3 часам
    return tokens.filter((t) => {
      if (!t.first_seen_at) return true;
      const ts = new Date(t.first_seen_at).getTime();
      return now - ts <= WINDOW_MS;
    });
  } catch (e) {
    console.error("[Zora] unexpected error", e);
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
      console.error("[GeckoTerminal] error", e);
      result.push({ ...t });
    }
  }

  return result;
}

// ======================= Агрегатор =======================

export async function getTokens(): Promise<TokenWithMarket[]> {
  const [clanker, zora] = await Promise.all([
    fetchTokensFromClanker().catch(() => []),
    fetchTokensFromZora().catch(() => []),
  ]);

  // склеиваем и убираем дубликаты по адресу (Clanker имеет приоритет)
  const all: Token[] = [...zora, ...clanker];
  const byAddress = new Map<string, Token>();
  for (const t of all) {
    const key = t.token_address.toLowerCase();
    if (!byAddress.has(key)) {
      byAddress.set(key, t);
    }
  }

  const merged = Array.from(byAddress.values());
  const withMarket = await enrichWithGeckoTerminal(merged);
  return withMarket;
}
