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
  price_usd?: number;
  liquidity_usd?: number;
  volume_24h?: number;
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

// GeckoTerminal API (полный переход с DexScreener)
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
  const MAX_PAGES = 10; // до ~200 токенов за 3 часа

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
        website_url: undefined,
        x_url: undefined,
        telegram_url: undefined,
      };

      // режем спамерских создателей
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

// -------- GeckoTerminal: цена / FDV / ликвидность / объём --------

// Функция оставляет старое имя, чтобы route.ts не ломать
export async function enrichWithDexScreener(
  tokens: Token[]
): Promise<TokenWithMarket[]> {
  const result: TokenWithMarket[] = [];

  for (const t of tokens) {
    try {
      const url = `${GECKO_BASE}/networks/${GECKO_NETWORK}/tokens/${t.token_address}?include=top_pools`;
      const res = await fetch(url, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });

      if (!res.ok) {
        // если Gecko не знает токен — просто возвращаем без маркет-данных
        result.push({ ...t });
        continue;
      }

      const json: any = await res.json();
      const attrs = json?.data?.attributes ?? {};
      const included = Array.isArray(json?.included) ? json.included : [];

      // Цена токена
      let priceUsd: number | undefined;
      if (attrs.price_usd !== undefined && attrs.price_usd !== null) {
        const n = Number(attrs.price_usd);
        if (Number.isFinite(n)) priceUsd = n;
      }

      // FDV (будем трактовать как market cap)
      let fdvUsd: number | undefined;
      if (attrs.fdv_usd !== undefined && attrs.fdv_usd !== null) {
        const n = Number(attrs.fdv_usd);
        if (Number.isFinite(n)) fdvUsd = n;
      }

      // Берём первый пул (top pool) и вытаскиваем оттуда ликвидность + объём
      let liquidityUsd: number | undefined;
      let volume24h: number | undefined;

      const firstPool =
        included.find((inc: any) => inc?.type === "pool") ?? included[0];

      if (firstPool?.attributes) {
        const pa = firstPool.attributes;

        const reserveRaw =
          pa.reserve_in_usd ??
          pa.liquidity_usd ??
          pa.total_reserve_in_usd ??
          null;
        const volumeRaw =
          pa.volume_usd_24h ??
          pa.volume_usd ??
          pa.volume_24h_usd ??
          pa.volume_24h ??
          null;

        if (reserveRaw !== null && reserveRaw !== undefined) {
          const n = Number(reserveRaw);
          if (Number.isFinite(n)) liquidityUsd = n;
        }

        if (volumeRaw !== null && volumeRaw !== undefined) {
          const n = Number(volumeRaw);
          if (Number.isFinite(n)) volume24h = n;
        }
      }

      result.push({
        ...t,
        price_usd: priceUsd,
        // fdv можно потом вывести отдельной колонкой, пока кладём в liquidity или оставляем как есть
        liquidity_usd: liquidityUsd ?? fdvUsd,
        volume_24h: volume24h,
      });
    } catch (e) {
      // на любой ошибке Gecko — просто возвращаем токен без маркет-данных
      console.error("GeckoTerminal error for", t.token_address, e);
      result.push({ ...t });
    }
  }

  return result;
}
