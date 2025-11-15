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

// -------- Константы --------

const CLANKER_API = "https://www.clanker.world/api/tokens";
const CLANKER_FRONT = "https://www.clanker.world";
const DEX_URL = "https://api.dexscreener.com/latest/dex/tokens";

// -------- Вспомогательная функция --------

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

// -------- Fetch Clanker Tokens --------

export async function fetchTokensFromClanker(): Promise<Token[]> {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  const oneHourAgo = now - ONE_HOUR;
  const startDateUnix = Math.floor(oneHourAgo / 1000);

  let cursor: string | undefined = undefined;
  const collected: any[] = [];
  const MAX_PAGES = 10;

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
      if (t.chain_id && t.chain_id !== 8453) return null;

      const addr = (t.contract_address || "").toLowerCase();
      if (!addr) return null;

      const name = (t.name || "").toString();
      const symbol = (t.symbol || "").toString();

      // --- FID creator ---
      let fid: number | string | undefined;

      if (Array.isArray(t.fids) && t.fids.length > 0) {
        fid = t.fids[0];
      } else if (typeof t.fid !== "undefined") {
        fid = t.fid;
      }

      const farcaster_url = fid
        ? `https://farcaster.xyz/profiles/${fid}`
        : undefined;

      const firstSeen =
        t.created_at || t.deployed_at || t.last_indexed || undefined;

      return {
        token_address: addr,
        name,
        symbol,
        source: "clanker",
        source_url: `${CLANKER_FRONT}/clanker/${addr}`,
        first_seen_at: firstSeen,

        // Only Farcaster for Clanker
        farcaster_url,
        website_url: undefined,
        x_url: undefined,
        telegram_url: undefined,
      } as Token;
    })
    .filter(Boolean) as Token[];

  return tokens.filter((t) => {
    if (!t.first_seen_at) return true;
    const ts = new Date(t.first_seen_at).getTime();
    return now - ts <= ONE_HOUR;
  });
}

// -------- DexScreener enrich --------

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
