// lib/providers.js

const ZORA_URL = "https://coins-api.zora.co/coins/latest?limit=50";
const CLANKER_URL = "https://www.clanker.world/api/tokens";
const DEX_URL =
  process.env.DEXSCREENER_BASE ||
  "https://api.dexscreener.com/latest/dex/tokens";
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "";
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || "";

// универсальный fetch с таймаутом
async function fetchJson(url, init) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(url + " " + res.status);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// ----- Zora & Clanker (без ключа для Clanker) -----
export async function fetchZoraLatest() {
  return fetchJson(ZORA_URL, {
    headers: { "api-key": process.env.ZORA_API_KEY || "" },
  });
}

export async function fetchClankerRecent() {
  // публичный эндпоинт, ключ не нужен
  return fetchJson(CLANKER_URL);
}

// нормализация Zora → общий формат
export function normalizeZora(json) {
  const items = Array.isArray(json?.coins) ? json.coins : [];
  return items
    .map((c) => ({
      token_address: (c?.address || c?.tokenAddress || "").toLowerCase(),
      name: c?.name || "",
      symbol: c?.symbol || "",
      source: "zora",
      source_url:
        c?.url || (c?.address ? `https://zora.co/coins/${c.address}` : undefined),
      first_seen_at: c?.createdAt || c?.created_at,
    }))
    .filter((x) => x.token_address);
}

// нормализация Clanker → общий формат
export function normalizeClanker(json) {
  // ответ может быть вида { items: [...] } или { tokens: [...] } или сразу массив
  const items =
    (Array.isArray(json?.items) && json.items) ||
    (Array.isArray(json?.tokens) && json.tokens) ||
    (Array.isArray(json) && json) ||
    [];

  return items
    .map((c) => ({
      token_address: (c?.address || c?.token_address || "").toLowerCase(),
      name: c?.name || "",
      symbol: c?.symbol || "",
      source: "clanker",
      source_url:
        c?.pageUrl ||
        (c?.address ? `https://www.clanker.world/token/${c.address}` : undefined),
      first_seen_at: c?.createdAt || c?.created_at,
      website_url: c?.links?.website,
      x_url: c?.links?.twitter || c?.links?.x,
      farcaster_url: c?.links?.farcaster,
      telegram_url: c?.links?.telegram,
    }))
    .filter((x) => x.token_address);
}

// дедуп по адресу токена
export function dedupeMerge(a, b) {
  const map = new Map();
  [...a, ...b].forEach((item) => {
    const key = item.token_address;
    if (!map.has(key)) {
      map.set(key, item);
    } else {
      const prev = map.get(key);
      const firstSeen = [prev.first_seen_at, item.first_seen_at]
        .filter(Boolean)
        .sort()[0];
      map.set(key, {
        token_address: key,
        name: prev.name || item.name,
        symbol: prev.symbol || item.symbol,
        source: prev.source || item.source,
        source_url: prev.source_url || item.source_url,
        first_seen_at: firstSeen,
        website_url: prev.website_url || item.website_url,
        x_url: prev.x_url || item.x_url,
        farcaster_url: prev.farcaster_url || item.farcaster_url,
        telegram_url: prev.telegram_url || item.telegram_url,
      });
    }
  });
  return Array.from(map.values());
}

// обогащение DexScreener (цена, ликвидность, объем)
export async function enrichDexScreener(tokens) {
  const out = [];
  for (const t of tokens) {
    try {
      const j = await fetchJson(`${DEX_URL}/${t.token_address}`);
      const pair = Array.isArray(j?.pairs) && j.pairs.length ? j.pairs[0] : undefined;
      out.push({
        ...t,
        price_usd: pair?.priceUsd ? Number(pair.priceUsd) : undefined,
        liquidity_usd: pair?.liquidity?.usd ? Number(pair.liquidity.usd) : undefined,
        volume_24h: pair?.volume?.h24 ? Number(pair.volume.h24) : undefined,
      });
    } catch (e) {
      out.push({ ...t });
    }
  }
  return out;
}

// ----- BaseScan: создатель контракта -----
export async function getContractCreator(tokenAddress) {
  if (!BASESCAN_API_KEY) return null;
  const url = `https://api.basescan.org/api?module=contract&action=getcontractcreation&contractaddresses=${tokenAddress}&apikey=${BASESCAN_API_KEY}`;
  try {
    const j = await fetchJson(url);
    const arr = Array.isArray(j?.result) ? j.result : [];
    const item = arr[0];
    const creator = item?.contractCreator;
    return creator ? String(creator) : null;
  } catch (e) {
    return null;
  }
}

// ----- Скрейп соцсетей со страницы токена -----
export async function scrapeSocialsFromSource(sourceUrl) {
  try {
    const res = await fetch(sourceUrl, { cache: "no-store" });
    const html = await res.text();

    const match = (re) => (html.match(re)?.[0] ?? "");
    const clean = (url) => url.replace(/["'<>)]$/g, "");

    const x =
      match(/https?:\/\/(?:twitter\.com|x\.com)\/[A-Za-z0-9_./-]+/i) || "";
    const fc =
      match(
        /https?:\/\/warpcast\.com\/[A-Za-z0-9_./-]+|https?:\/\/warpcast\.com\/~\/profiles\/\d+/i
      ) || "";
    const tg = match(/https?:\/\/t\.me\/[A-Za-z0-9_./-]+/i) || "";
    const site =
      match(
        /https?:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/[^\s"'<>]*)?/i
      ) || "";

    const socials = {};
    if (x) socials.x_url = clean(x);
    if (fc) socials.farcaster_url = clean(fc);
    if (tg) socials.telegram_url = clean(tg);

    // отбрасываем домены площадок/агрегаторов, оставляем внешний сайт проекта
    if (
      site &&
      !/clanker\.world|zora\.co|dexscreener|coingecko|etherscan|basescan/i.test(
        site
      )
    ) {
      socials.website_url = clean(site);
    }
    return socials;
  } catch (e) {
    return {};
  }
}

// ----- Farcaster / Neynar -----
function parseWarpcastFidOrUsername(url) {
  if (!url) return {};
  const mId = url.match(/\/~\/profiles\/(\d+)/i);
  if (mId) return { fid: Number(mId[1]) };
  const mUser = url.match(/warpcast\.com\/([A-Za-z0-9_]+)/i);
  if (mUser) return { username: mUser[1].toLowerCase() };
  return {};
}

async function neynarByAddress(addr) {
  if (!NEYNAR_API_KEY) return null;
  const url = `https://api.neynar.com/v2/farcaster/user/by-address?address=${addr}&chain=ethereum`;
  try {
    const j = await fetchJson(url, { headers: { "x-api-key": NEYNAR_API_KEY } });
    const user = j?.user;
    if (user?.fid) return { fid: Number(user.fid), username: user?.username };
    return null;
  } catch (e) {
    return null;
  }
}

async function neynarByUsername(username) {
  if (!NEYNAR_API_KEY) return null;
  const url = `https://api.neynar.com/v2/farcaster/user/by-username?username=${encodeURIComponent(
    username
  )}`;
  try {
    const j = await fetchJson(url, { headers: { "x-api-key": NEYNAR_API_KEY } });
    const user = j?.user;
    if (user?.fid) return { fid: Number(user.fid), username: user?.username };
    return null;
  } catch (e) {
    return null;
  }
}

export async function resolveFarcasterForCreator({
  creatorAddress,
  farcasterUrlFromSource,
}) {
  const parsed = parseWarpcastFidOrUsername(farcasterUrlFromSource);
  if (parsed.fid) return { fid: parsed.fid };
  if (parsed.username) {
    const u = await neynarByUsername(parsed.username);
    if (u?.fid) return u;
  }
  if (creatorAddress) {
    const u = await neynarByAddress(creatorAddress);
    if (u?.fid) return u;
  }
  return null;
}
