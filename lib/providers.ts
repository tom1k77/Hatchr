// lib/providers.ts

// -------- Типы --------

export interface Token {
  token_address: string;
  name?: string;
  symbol?: string;
  source?: string;
  source_url?: string;
  first_seen_at?: string;
  image_url?: string | null;

  // socials (ТОКЕНА)
  farcaster_url?: string; // ТОЛЬКО создатель, а не то, что вписали в метадату
  website_url?: string;
  x_url?: string;
  telegram_url?: string;
  instagram_url?: string;
  tiktok_url?: string;

  // запасные цифры из Zora (если Gecko не знает токен)
  zora_price_usd?: number | null;
  zora_market_cap_usd?: number | null;
  zora_volume_24h_usd?: number | null;
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
  if (!ZORA_API_KEY) {
    console.error(
      "[Zora] ZORA_API_KEY is not set. Add it to Vercel env vars (Name: ZORA_API_KEY)."
    );
    return null;
  }

  const url = new URL(path, ZORA_BASE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: {
      "api-key": ZORA_API_KEY,
      accept: "application/json",
    },
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

// Рекурсивно собираем все URL из объекта (метадата и т.д.)
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

// Преобразуем что угодно в number или null
function toNum(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

// ======================= CLANKER (3 часа) =======================

// Вспомогательная функция — нормализация ссылок (ipfs и т.п.)
function normalizeImageUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // ipfs://Qm... -> https://ipfs.io/ipfs/Qm...
  if (trimmed.startsWith("ipfs://")) {
    const hash = trimmed.replace("ipfs://", "");
    return `https://ipfs.io/ipfs/${hash}`;
  }

  // https://.../ipfs/Qm... -> https://ipfs.io/ipfs/Qm...
  const ipfsMatch = trimmed.match(/ipfs\/([^/?#]+)/);
  if (ipfsMatch?.[1]) {
    return `https://ipfs.io/ipfs/${ipfsMatch[1]}`;
  }

  // уже обычный https/ http — оставляем как есть
  return trimmed;
}

export async function fetchTokensFromClanker(): Promise<Token[]> {
  const now = Date.now();
  const WINDOW_MS = 6 * 60 * 60 * 1000; // 6 часов
  const windowAgo = now - WINDOW_MS;
  const startDateUnix = Math.floor(windowAgo / 1000);

  let cursor: string | undefined = undefined;
  const collected: any[] = [];
  const MAX_PAGES = 30; // сильно больше 300

  for (let i = 0; i < MAX_PAGES; i++) {
    const params = new URLSearchParams({
      limit: "30",
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
      console.error("[Clanker] fetch error, skip page:", url, e);
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

      // ------ картинка из Clanker ------
      const rawImage: string | null =
        (t.img_url as string | undefined) ||                 // главное поле
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
      
      // --- 1. Определяем создателя (Farcaster) ТОЛЬКО по user/fid ---
      let fid: number | string | undefined;
      if (Array.isArray(t.fids) && t.fids.length > 0) {
        fid = t.fids[0];
      } else if (typeof t.fid !== "undefined") {
        fid = t.fid;
      }

      const rawUsername =
        creator.fname ||
        creator.username ||
        creator.handle ||
        creator.name ||
        "";

      const username =
        typeof rawUsername === "string"
          ? rawUsername.replace(/^@/, "").trim()
          : "";

      let farcasterUrl: string | undefined;

      if (username) {
        // создатель по хендлу
        farcasterUrl = `https://farcaster.xyz/${username}`;
      } else if (typeof fid !== "undefined") {
        // создатель по fid
        farcasterUrl = `https://farcaster.xyz/profiles/${fid}`;
      }

      // --- 2. Соцсети токена ТОЛЬКО из metadata (то, что создатель вписал вручную) ---
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

          // Farcaster-ссылки в метадате игнорируем (чтобы не подменяли создателя)
          if (
            host === "warpcast.com" ||
            host.endsWith("farcaster.xyz") ||
            host === "farcaster.xyz"
          ) {
            continue;
          }

          if (!x_url && (host === "x.com" || host === "twitter.com")) {
            x_url = u;
            continue;
          }

          if (
            !telegram_url &&
            (host === "t.me" ||
              host === "telegram.me" ||
              host === "telegram.org")
          ) {
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

          // всё остальное — в website, если его ещё нет
          if (!website_url) {
            website_url = u;
          }
        } catch {
          // если URL кривой — просто скипаем
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
  image_url,          // ← ДОБАВЛЕНО ПРАВИЛЬНО
  first_seen_at: firstSeen,
  farcaster_url: farcasterUrl,
  website_url,
  x_url,
  telegram_url,
  instagram_url,
  tiktok_url,
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
  const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 часа

  if (!ZORA_API_KEY) {
    console.error(
      "[Zora] ZORA_API_KEY is not set, skipping Zora tokens entirely."
    );
    return [];
  }

  const tokens: Token[] = [];
  let cursor: string | undefined = undefined;
  const PAGE_SIZE = 100; // вместо 50
  const MAX_PAGES = 100; // вместо 10

  for (let i = 0; i < MAX_PAGES; i++) {
    const params: Record<string, string> = {
      listType: "NEW_CREATORS",
      count: String(PAGE_SIZE),
    };
    if (cursor) {
      params.after = cursor;
    }

    const json = await fetchJsonZora("/explore", params);

    const edges: any[] = Array.isArray(json?.exploreList?.edges)
      ? json.exploreList.edges
      : [];

    if (!edges.length) break;

    for (const edge of edges) {
      const n = edge?.node;
      if (!n) continue;

      // только Base
      if (n.chainId && n.chainId !== 8453) continue;

      const addr = (n.address || "").toString().toLowerCase();
      if (!addr) continue;

      const name = (n.name || "").toString();
      const symbol = (n.symbol || "").toString();

      // createdAt приходит без "Z", нормализуем
      const createdRaw = n.createdAt ?? null;
      let createdIso: string | undefined;
      if (typeof createdRaw === "string" && createdRaw) {
        const normalized =
          createdRaw.endsWith("Z") || createdRaw.endsWith("z")
            ? createdRaw
            : createdRaw + "Z";
        const d = new Date(normalized);
        if (!Number.isNaN(d.getTime())) {
          createdIso = d.toISOString();
        }
      }

      // цифры с Zora
      const marketCapNum = toNum(n.marketCap);
      const volume24Num = toNum(n.volume24h);
      const priceUsdcNum = toNum(n.tokenPrice?.priceInUsdc);

      // соцсети создателя
      const social = n.creatorProfile?.socialAccounts ?? {};
      let farcaster_url: string | undefined;
      let x_url: string | undefined;
      let instagram_url: string | undefined;
      let tiktok_url: string | undefined;

      if (social.farcaster?.username) {
        farcaster_url = `https://warpcast.com/${social.farcaster.username}`;
      }
      if (social.twitter?.username) {
        x_url = `https://x.com/${social.twitter.username}`;
      }
      if (social.instagram?.username) {
        instagram_url = `https://instagram.com/${social.instagram.username}`;
      }
      if (social.tiktok?.username) {
        tiktok_url = `https://www.tiktok.com/@${social.tiktok.username}`;
      }

      const source_url = `https://zora.co/coin/base:${addr}`;

      // --- картинка токена / аватар создателя (Zora) ---
      let rawImage: string | null = null;

      // 1) сначала пробуем любые "прямые" поля у токена
      const directImage: string | undefined =
        (n.imageUrl as string | undefined) ??
        (n.image_url as string | undefined) ??
        (n.image?.url as string | undefined) ??
        (Array.isArray(n.media) && n.media[0]?.url
          ? (n.media[0].url as string)
          : undefined);

      if (directImage) {
        rawImage = directImage;
      } else {
        // 2) если ничего нет — берём первый URL из avatar создателя
        const avatarUrls = collectUrls(n.creatorProfile?.avatar ?? null);
        if (avatarUrls.length > 0) {
          rawImage = avatarUrls[0];
        }
      }

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

    // курсор на следующую страницу
    cursor = json?.exploreList?.pageInfo?.endCursor;
    const hasNextPage = Boolean(json?.exploreList?.pageInfo?.hasNextPage);
    if (!hasNextPage) break;

    // если последние токены уже старше 3 часов — выходим
    const last = tokens[tokens.length - 1];
    if (last?.first_seen_at) {
      const ts = new Date(last.first_seen_at).getTime();
      if (now - ts > WINDOW_MS) break;
    }
  }

  // финальный фильтр по окну 3 часа
  return tokens.filter((t) => {
    if (!t.first_seen_at) return true;
    const ts = new Date(t.first_seen_at).getTime();
    return now - ts <= WINDOW_MS;
  });
}

// ======================= GeckoTerminal =======================

export async function enrichWithGeckoTerminal(
  tokens: Token[]
): Promise<TokenWithMarket[]> {
  const result: TokenWithMarket[] = [];

  for (const t of tokens) {
    try {
      const res = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/base/tokens/${t.token_address}`,
        {
          cache: "no-store",
        }
      );

      let price: number | null = null;
      let marketCap: number | null = null;
      let liquidity: number | null = null;
      let volume24: number | null = null;

      if (res.ok) {
        const data: any = await res.json();
        const attr = data?.data?.attributes || {};

        price = toNum(attr.price_usd);

        marketCap = toNum(
          attr.market_cap_usd ??
            attr.fully_diluted_valuation_usd ??
            attr.fully_diluted_valuation ??
            attr.fdv_usd
        );

        liquidity = toNum(attr.liquidity_usd ?? attr.reserve_in_usd);

        volume24 = toNum(
          attr.volume_usd?.h24 ??
            attr.trade_volume_24h_usd ??
            attr.trade_volume_24h ??
            attr.volume_24h_usd
        );
      }

      // если Gecko не знает токен, а это Zora — используем его цифры
      if (t.source === "zora") {
        if (price == null || price === 0) {
          price = toNum((t as any).zora_price_usd);
        }
        if (marketCap == null || marketCap === 0) {
          marketCap = toNum((t as any).zora_market_cap_usd);
        }
        if (volume24 == null || volume24 === 0) {
          volume24 = toNum((t as any).zora_volume_24h_usd);
        }
      }

      result.push({
        ...t,
        price_usd: price,
        market_cap_usd: marketCap,
        liquidity_usd: liquidity,
        volume_24h_usd: volume24,
      });
    } catch {
      // если Gecko совсем упал — просто прокидываем токен как есть
      result.push({ ...t });
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
  const all: Token[] = [...clanker, ...zora];
  const byAddress = new Map<string, Token>();
  for (const t of all) {
    byAddress.set(t.token_address.toLowerCase(), t);
  }

  const merged = Array.from(byAddress.values());
  const withMarket = await enrichWithGeckoTerminal(merged);
  return withMarket;
}
