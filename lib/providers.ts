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

// Zora SDK base URL
const ZORA_BASE_URL = "https://api-sdk.zora.engineering";
const ZORA_API_KEY = process.env.ZORA_API_KEY;

// -------- Вспомогательные функции --------

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

async function fetchJsonZora(path: string, params: Record<string, string>) {
  const url = new URL(path, ZORA_BASE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const headers: Record<string, string> = {
    accept: "application/json",
  };
  if (ZORA_API_KEY) {
    headers["api-key"] = ZORA_API_KEY;
  }

  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      "[Zora] fetch error",
      res.status,
      res.statusText,
      "URL:",
      url.toString(),
      "Body:",
      text.slice(0, 300)
    );
    return null;
  }

  try {
    return await res.json();
  } catch (e) {
    console.error("[Zora] JSON parse error", e);
    return null;
  }
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

      const urlsMeta = collectUrls(meta);
      const urlsCreator = collectUrls(creator);
      const allUrls = [...urlsMeta, ...urlsCreator];

      // берём только реальные ссылки на Farcaster/warpcast, без выдумывания
      let farcasterUrl =
        allUrls.find((u) => {
          const lu = u.toLowerCase();
          return lu.includes("warpcast.com") || lu.includes("farcaster.xyz");
        }) || undefined;

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

// ======================= ZORA (3 часа, NEW_CREATORS) =======================

export async function fetchTokensFromZora(): Promise<Token[]> {
  const now = Date.now();
  const WINDOW_MS = 3 * 60 * 60 * 1000; // 3 часа

  const json = await fetchJsonZora("/explore", {
    listType: "NEW_CREATORS",
    count: "200",
  });

  const edges: any[] = json?.exploreList?.edges ?? [];
  if (!edges.length) return [];

  const out: Token[] = edges
    .map((edge: any) => {
      const node = edge?.node;
      if (!node) return null;

      if (node.chainId && node.chainId !== 8453) return null;

      const addr = (node.address || "").toString().toLowerCase();
      if (!addr) return null;

      const name = (node.name || "").toString();
      const symbol = (node.symbol || "").toString();

      // createdAt приходит без "Z" -> считаем, что это UTC и приводим к ISO
      const rawCreated: string | undefined = node.createdAt || undefined;
      let firstSeen: string | undefined;
      if (rawCreated) {
        const d = new Date(
          rawCreated.endsWith("Z") ? rawCreated : rawCreated + "Z"
        );
        if (!Number.isNaN(d.getTime())) {
          firstSeen = d.toISOString();
        }
      }

      // Маркет-данные от Zora
      const priceUsd =
        node.tokenPrice?.priceInUsdc != null
          ? Number(node.tokenPrice.priceInUsdc) || null
          : null;
      const marketCap =
        node.marketCap != null ? Number(node.marketCap) || null : null;
      const volume24 =
        node.volume24h != null ? Number(node.volume24h) || null : null;

      // Соцсети — только если реально есть в socialAccounts
      let farcasterUrl: string | undefined;
      let xUrl: string | undefined;

      const socials = node.creatorProfile?.socialAccounts;
      const farcaster = socials?.farcaster;
      const twitter = socials?.twitter;

      if (farcaster?.username) {
        farcasterUrl = `https://warpcast.com/${farcaster.username}`;
      }
      if (twitter?.username) {
        xUrl = `https://x.com/${twitter.username}`;
      }

      const token: TokenWithMarket = {
        token_address: addr,
        name,
        symbol,
        source: "zora",
        // NB: у creator coins путь /coin/
        source_url: `https://zora.co/coin/base:${addr}`,
        first_seen_at: firstSeen,
        farcaster_url: farcasterUrl,
        x_url: xUrl,
        price_usd: priceUsd,
        market_cap_usd: marketCap,
        volume_24h_usd: volume24,
        liquidity_usd: null,
      };

      if (isBlockedCreator(token.farcaster_url)) return null;

      return token;
    })
    .filter(Boolean) as TokenWithMarket[];

  // фильтр по окну 3 часа (допускаем небольшой дрейф вперёд, до +5 минут)
  return out.filter((t) => {
    if (!t.first_seen_at) return true;
    const ts = new Date(t.first_seen_at).getTime();
    if (Number.isNaN(ts)) return false;
    const diff = now - ts;
    return diff <= WINDOW_MS && diff >= -5 * 60 * 1000;
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
        result.push({ ...(t as TokenWithMarket) });
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
        ...(t as TokenWithMarket),
        price_usd: price ?? (t as any).price_usd ?? null,
        market_cap_usd: marketCap ?? (t as any).market_cap_usd ?? null,
        liquidity_usd: liquidity ?? (t as any).liquidity_usd ?? null,
        volume_24h_usd: volume24 ?? (t as any).volume_24h_usd ?? null,
      });
    } catch {
      result.push({ ...(t as TokenWithMarket) });
    }
  }

  return result;
}

// ======================= Агрегатор =======================

export async function getTokens(): Promise<TokenWithMarket[]> {
  const [clanker, zora] = await Promise.all([
    fetchTokensFromClanker(),
    fetchTokensFromZora(),
  ]);

  // склеиваем и убираем дубликаты по адресу
  const byAddress = new Map<string, Token>();

  const addTokens = (list: Token[]) => {
    for (const t of list) {
      const key = t.token_address.toLowerCase();
      const existing = byAddress.get(key);
      if (!existing) {
        byAddress.set(key, t);
      } else {
        // если есть дубликат — оставляем тот, у кого больше данных по маркету
        const ex = existing as any;
        const cur = t as any;

        const exHasMarket =
          ex.market_cap_usd != null ||
          ex.volume_24h_usd != null ||
          ex.price_usd != null;
        const curHasMarket =
          cur.market_cap_usd != null ||
          cur.volume_24h_usd != null ||
          cur.price_usd != null;

        if (!exHasMarket && curHasMarket) {
          byAddress.set(key, t);
        }
      }
    }
  };

  addTokens(clanker);
  addTokens(zora);

  let merged = Array.from(byAddress.values());

  // сортируем по времени (новые сверху)
  merged = merged.sort((a, b) => {
    const ta = a.first_seen_at
      ? new Date(a.first_seen_at).getTime()
      : 0;
    const tb = b.first_seen_at
      ? new Date(b.first_seen_at).getTime()
      : 0;
    return tb - ta;
  });

  const withMarket = await enrichWithGeckoTerminal(merged);
  return withMarket;
}
