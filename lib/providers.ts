// lib/providers.ts

// -------- Типы --------

export interface Token {
  token_address: string;
  name?: string;
  symbol?: string;
  source?: string;
  source_url?: string;
  first_seen_at?: string;

  // Socials
  farcaster_url?: string;
  website_url?: string;
  x_url?: string;
  telegram_url?: string;
}

export interface TokenWithMarket extends Token {
  market_cap_usd?: number;
  price_usd?: number;
  liquidity_usd?: number;
  volume_24h_usd?: number;
}

// --- Blacklist Farcaster creators (боты и спамеры) ---
const BLOCKED_FARCASTER_USERS = [
  "primatirta",
  "pinmad",
  "senang",
  "mybrandio",
];

// helper: вытащить ник из farcaster_url
function isBlockedCreator(farcasterUrl?: string | null): boolean {
  if (!farcasterUrl) return false;

  try {
    const url = new URL(farcasterUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    if (!parts[0]) return false;

    const handle = parts[0].toLowerCase();
    return BLOCKED_FARCASTER_USERS.includes(handle);
  } catch {
    // если невалидный URL — не блокировать
    return false;
  }
}

// -------- Константы --------

const CLANKER_API = "https://www.clanker.world/api/tokens";
const CLANKER_FRONT = "https://www.clanker.world";

// GeckoTerminal API
const GECKO_BASE = "https://api.geckoterminal.com/api/v2";
const GECKO_NETWORK = "base";

// -------- Вспомогательные функции --------

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

// Рекурсивно собираем все URL в объекте (metadata, related.user и т.п.)
function collectUrls(obj: any, depth = 0, acc: string[] = []): string[] {
  if (!obj || depth > 6) return acc;

  if (typeof obj === "string") {
    const s = obj.trim();
    if (s.startsWith("http://") || s.startsWith("https://")) {
      acc.push(s);
    }
    return acc;
  }

  if (Array.isArray(obj)) {
    for (const v of obj) collectUrls(v, depth + 1, acc);
    return acc;
  }

  if (typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      const v = (obj as any)[key];
      collectUrls(v, depth + 1, acc);
    }
  }

  return acc;
}

// -------- Clanker: токены Base за последние 3 часа --------

export async function fetchTokensFromClanker(): Promise<Token[]> {
  const now = Date.now();
  const WINDOW_MS = 3 * 60 * 60 * 1000; // 3 часа
  const fromTs = now - WINDOW_MS;
  const startDateUnix = Math.floor(fromTs / 1000);

  let cursor: string | undefined = undefined;
  const collected: any[] = [];
  const MAX_PAGES = 10; // до ~200 токенов

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
      // только Base
      if (t.chain_id && t.chain_id !== 8453) return null;

      const addr = (t.contract_address || "").toString().toLowerCase();
      if (!addr) return null;

      const name = (t.name || "").toString();
      const symbol = (t.symbol || "").toString();

      const meta = t.metadata || {};
      const creator = t.related?.user || {};

      // 1) собираем все URL и ищем готовый farcaster.xyz
      const urlsMeta = collectUrls(meta);
      const urlsCreator = collectUrls(creator);
      const allUrls = [...urlsMeta, ...urlsCreator];

      let farcasterUrl =
        allUrls.find((u) =>
          u.toLowerCase().includes("farcaster.xyz")
        ) || undefined;

      // 2) если прямого URL нет — строим по username / handle / fname
      let fid: number | string | undefined;
      if (Array.isArray(t.fids) && t.fids.length > 0) {
        fid = t.fids[0];
      } else if (typeof t.fid !== "undefined") {
        fid = t.fid;
      }

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

  // Доп. фильтр по окну в 3 часа
  return tokens.filter((t) => {
    if (!t.first_seen_at) return true;
    const ts = new Date(t.first_seen_at).getTime();
    return now - ts <= WINDOW_MS;
  });
}

// -------- КЭШ маркет-данных --------

type MarketCacheEntry = {
  market_cap_usd?: number;
  price_usd?: number;
  liquidity_usd?: number;
  volume_24h_usd?: number;
  updated_at: number;
};

// простейший in-memory кэш по адресу контракта
const MARKET_CACHE: Record<string, MarketCacheEntry> = {};

// -------- GeckoTerminal: market cap / ликвидность / объём --------

// Оставляем старое имя, чтобы route.ts не ломать
export async function enrichWithDexScreener(
  tokens: Token[]
): Promise<TokenWithMarket[]> {
  const result: TokenWithMarket[] = [];

  for (const t of tokens) {
    const key = t.token_address.toLowerCase();
    const prev = MARKET_CACHE[key];

    try {
      const url = `${GECKO_BASE}/networks/${GECKO_NETWORK}/tokens/${t.token_address}?include=top_pools`;
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });

      if (!res.ok) {
        // ❗ Gecko не ответил / 4xx / 5xx — ОСТАЁМСЯ НА СТАРЫХ ДАННЫХ
        if (prev) {
          result.push({
            ...t,
            ...prev,
          });
        } else {
          result.push({ ...t });
        }
        continue;
      }

      const json: any = await res.json();
      const attrs = json?.data?.attributes ?? {};
      const included = Array.isArray(json?.included) ? json.included : [];

      // ---------- Market cap / price ----------
      let marketCapUsd: number | undefined;
      let priceUsd: number | undefined;

      const mcRaw =
        attrs.market_cap_usd ??
        attrs.fdv_usd ??
        attrs.market_cap ??
        attrs.fdv ??
        null;

      if (mcRaw !== null && mcRaw !== undefined) {
        const n = Number(mcRaw);
        if (Number.isFinite(n)) marketCapUsd = n;
      }

      const priceRaw =
        attrs.price_usd ??
        attrs.token_price_usd ??
        attrs.base_token_price_usd ??
        null;

      if (priceRaw !== null && priceRaw !== undefined) {
        const n = Number(priceRaw);
        if (Number.isFinite(n)) priceUsd = n;
      }

      // ---------- Пул: ликвидность + объём ----------
      let liquidityUsd: number | undefined;
      let volume24hUsd: number | undefined;

      const firstPool =
        included.find((inc: any) => inc?.type === "pool") ?? included[0];

      if (firstPool?.attributes) {
        const pa = firstPool.attributes;

        const liqRaw =
          pa.reserve_in_usd ??
          pa.liquidity_usd ??
          pa.total_reserve_in_usd ??
          pa.reserve_usd ??
          null;

        const volRaw =
          pa.volume_usd_24h ??
          pa.volume_usd ??
          pa.volume_24h_usd ??
          pa.volume_24h ??
          attrs.volume_usd_24h ??
          attrs.volume_usd ??
          null;

        if (liqRaw !== null && liqRaw !== undefined) {
          const n = Number(liqRaw);
          if (Number.isFinite(n)) liquidityUsd = n;
        }

        if (volRaw !== null && volRaw !== undefined) {
          const n = Number(volRaw);
          if (Number.isFinite(n)) volume24hUsd = n;
        }
      }

      // ---------- МЕРДЖ С ПРЕДЫДУЩИМИ ДАННЫМИ (НЕ ЗАТИРАЕМ НА null) ----------

      const merged: TokenWithMarket = {
        ...t,
        market_cap_usd:
          typeof marketCapUsd === "number"
            ? marketCapUsd
            : prev?.market_cap_usd,
        price_usd:
          typeof priceUsd === "number" ? priceUsd : prev?.price_usd,
        liquidity_usd:
          typeof liquidityUsd === "number"
            ? liquidityUsd
            : prev?.liquidity_usd,
        volume_24h_usd:
          typeof volume24hUsd === "number"
            ? volume24hUsd
            : prev?.volume_24h_usd,
      };

      // если хоть что-то есть — кладём в кэш
      if (
        typeof merged.market_cap_usd === "number" ||
        typeof merged.price_usd === "number" ||
        typeof merged.liquidity_usd === "number" ||
        typeof merged.volume_24h_usd === "number"
      ) {
        MARKET_CACHE[key] = {
          market_cap_usd: merged.market_cap_usd,
          price_usd: merged.price_usd,
          liquidity_usd: merged.liquidity_usd,
          volume_24h_usd: merged.volume_24h_usd,
          updated_at: Date.now(),
        };
      }

      result.push(merged);
    } catch (e) {
      console.error("GeckoTerminal error for", t.token_address, e);
      // ❗ Любая ошибка — используем старые значения, если они были
      if (prev) {
        result.push({
          ...t,
          ...prev,
        });
      } else {
        result.push({ ...t });
      }
    }
  }

  return result;
}
