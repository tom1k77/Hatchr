// lib/providers.ts

// Базовый тип токена для фронта
export interface Token {
  token_address: string;
  name?: string;
  symbol?: string;
  source?: string;
  source_url?: string;
  first_seen_at?: string;
  website_url?: string;
  x_url?: string;
  farcaster_url?: string;
  telegram_url?: string;
}

// Тип токена + рынок
export interface TokenWithMarket extends Token {
  price_usd?: number;
  liquidity_usd?: number;
  volume_24h?: number;
}

const CLANKER_API = "https://www.clanker.world/api/tokens";
const CLANKER_FRONT = "https://www.clanker.world";
const DEX_URL = "https://api.dexscreener.com/latest/dex/tokens";

// --- helpers ---

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

function pickUrl(urls: any[], predicate: (u: string) => boolean): string | undefined {
  for (const s of urls || []) {
    const u = typeof s === "string" ? s : s?.url;
    if (!u || typeof u !== "string") continue;
    if (predicate(u)) return u;
  }
  return undefined;
}

// --- CLANKER: все токены за последний час на Base ---

export async function fetchTokensFromClanker(): Promise<Token[]> {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  const oneHourAgo = now - ONE_HOUR;
  const startDateUnix = Math.floor(oneHourAgo / 1000); // Unix timestamp (секунды)

  let cursor: string | undefined = undefined;
  const collected: any[] = [];
  const MAX_PAGES = 10; // 10 * 20 = максимум 200 токенов за час

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
      const tokenSocials = Array.isArray(meta.socialMediaUrls)
        ? meta.socialMediaUrls
        : [];

      const creator = t.related?.user || {};
      const creatorSocials = Array.isArray(creator.socialMediaUrls)
        ? creator.socialMediaUrls
        : [];

      const socials = [...tokenSocials, ...creatorSocials];

      const xUrl = pickUrl(
        socials,
        (u) => u.includes("twitter.com") || u.includes("x.com")
      );
      const farcasterUrl = pickUrl(socials, (u) => u.includes("warpcast.com"));
      const telegramUrl = pickUrl(
        socials,
        (u) => u.includes("t.me") || u.includes("telegram.me")
      );
      const websiteUrl = pickUrl(
        socials,
        (u) =>
          !u.includes("twitter.com") &&
          !u.includes("x.com") &&
          !u.includes("warpcast.com") &&
          !u.includes("t.me") &&
          !u.includes("telegram.me")
      );

      const firstSeen =
        t.created_at || t.deployed_at || t.last_indexed || undefined;

      return {
        token_address: addr,
        name,
        symbol,
        source: "clanker",
        // ✅ правильный URL страницы токена на Clanker
        source_url: `${CLANKER_FRONT}/clanker/${addr}`,
        first_seen_at: firstSeen,
        website_url: websiteUrl,
        x_url: xUrl,
        farcaster_url: farcasterUrl,
        telegram_url: telegramUrl,
      } as Token;
    })
    .filter(Boolean) as Token[];

  // на всякий случай ещё раз фильтруем по последнему часу
  return tokens.filter((t) => {
    if (!t.first_seen_at) return true;
    const ts = new Date(t.first_seen_at).getTime();
    return now - ts <= ONE_HOUR;
  });
}

// --- DexScreener: цена / ликвидность / объём ---

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
      const pairs = Array.isArray(data?.pairs) ? data.pairs : [];
      const pair =
        pairs.find((p: any) => p.chainId === "base") ||
        (pairs.length ? pairs[0] : null);

      if (!pair) {
        result.push({ ...t });
        continue;
      }

      result.push({
        ...t,
        price_usd: pair.priceUsd ? Number(pair.priceUsd) : undefined,
        liquidity_usd: pair.liquidity?.usd
          ? Number(pair.liquidity.usd)
          : undefined,
        volume_24h: pair.volume?.h24
          ? Number(pair.volume.h24)
          : undefined,
      });
    } catch {
      result.push({ ...t });
    }
  }

  return result;
}
