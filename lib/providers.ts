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
const BLOCKED_FARCASTER_USERS = ["primatirta", "pinmad", "senang", "hahe", "asba", "lavynta", "buyan", "mybrandio"];

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

// тут теперь GeckoTerminal, имя переменной оставляем как было,
// чтобы ничего не ломать в других местах
const DEX_URL = "https://api.geckoterminal.com/api/v2/networks/base/tokens";

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
  const THREE_HOURS = 3 * 60 * 60 * 1000;
  const threeHoursAgo = now - THREE_HOURS;
  const startDateUnix = Math.floor(threeHoursAgo / 1000);

  let cursor: string | undefined = undefined;
  const collected: any[] = [];
  const MAX_PAGES = 10; // до ~200 токенов (можно увеличить при необходимости)

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

      // фильтр ботов по нику
      if (isBlockedCreator(farcasterUrl)) return null;

      const firstSeen =
        t.created_at || t.deployed_at || t.last_indexed || undefined;

      return {
        token_address: addr,
        name,
        symbol,
        source: "clanker",
        source_url: `${CLANKER_FRONT}/clanker/${addr}`,
        first_seen_at: firstSeen,

        // для Clanker — только Farcaster
        farcaster_url: farcasterUrl,
        website_url: undefined,
        x_url: undefined,
        telegram_url: undefined,
      } as Token;
    })
    .filter(Boolean) as Token[];

  // Допфильтр "в пределах 3 часов"
  return tokens.filter((t) => {
    if (!t.first_seen_at) return true;
    const ts = new Date(t.first_seen_at).getTime();
    return now - ts <= THREE_HOURS;
  });
}

// -------- GeckoTerminal: цена / ликвидность / объём --------
//
// Мы оставляем имя функции enrichWithDexScreener,
// чтобы ничего не ломать в route.ts, но внутри используем GeckoTerminal.

export async function enrichWithDexScreener(
  tokens: Token[]
): Promise<TokenWithMarket[]> {
  const result: TokenWithMarket[] = [];

  for (const t of tokens) {
    try {
      const res = await fetch(`${DEX_URL}/${t.token_address}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        result.push({ ...t });
        continue;
      }

      const data: any = await res.json();
      const attrs: any = data?.data?.attributes ?? {};

      const price =
        typeof attrs.price_usd === "string" || typeof attrs.price_usd === "number"
          ? Number(attrs.price_usd)
          : undefined;

      const liquidity =
        typeof attrs.total_reserve_in_usd === "string" ||
        typeof attrs.total_reserve_in_usd === "number"
          ? Number(attrs.total_reserve_in_usd)
          : undefined;

      let volume24: number | undefined;
      const vol = attrs.volume_usd;
      if (vol && (typeof vol.h24 === "string" || typeof vol.h24 === "number")) {
        volume24 = Number(vol.h24);
      } else if (
        typeof attrs.volume_usd_24h === "string" ||
        typeof attrs.volume_usd_24h === "number"
      ) {
        volume24 = Number(attrs.volume_usd_24h);
      }

      result.push({
        ...t,
        price_usd: Number.isFinite(price!) ? price : undefined,
        liquidity_usd: Number.isFinite(liquidity!) ? liquidity : undefined,
        volume_24h: Number.isFinite(volume24!) ? volume24 : undefined,
      });
    } catch {
      // в случае любой ошибки просто возвращаем токен как есть
      result.push({ ...t });
    }
  }

  return result;
}
