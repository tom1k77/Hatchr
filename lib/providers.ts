// lib/providers.ts

import { Token, TokenWithMarket } from "./types";

// ================== Константы ==================

const CLANKER_API = "https://www.clanker.world/api/tokens";
const CLANKER_FRONT = "https://www.clanker.world";

const ZORA_BASE_URL = "https://api-sdk.zora.engineering";
const ZORA_API_KEY = process.env.ZORA_API_KEY;

const GECKO_BASE_TOKENS =
  "https://api.geckoterminal.com/api/v2/networks/base/tokens";

const BLOCKED = ["primatirta", "pinmad", "senang", "mybrandio"];

// ================== Вспомогалка ==================

function safeNumber(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function isBlocked(url?: string | null): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    const h = u.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    return BLOCKED.includes(h);
  } catch {
    return false;
  }
}

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function fetchZora(path: string, params: Record<string, string>) {
  if (!ZORA_API_KEY) {
    console.error("⚠️ No ZORA_API_KEY");
    return null;
  }

  const url = new URL(path, ZORA_BASE_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { "api-key": ZORA_API_KEY, accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("❌ Zora error:", res.status, url.toString(), text);
    return null;
  }

  return res.json().catch(() => null);
}

// =========================================
// 1) ZORA TOKENS (NEW_CREATORS)
// =========================================

export async function fetchTokensFromZora(): Promise<Token[]> {
  const now = Date.now();
  const WINDOW_MS = 3 * 60 * 60 * 1000;

  const nodes: any[] = [];
  let cursor: string | undefined = undefined;

  for (let i = 0; i < 5; i++) {
    const json = await fetchZora("/explore", {
      listType: "NEW_CREATORS",
      count: "50",
      ...(cursor ? { after: cursor } : {}),
    });

    const edges = json?.exploreList?.edges ?? [];
    if (edges.length === 0) break;

    for (const e of edges) nodes.push(e.node);

    const page = json?.exploreList?.pageInfo;
    if (!page?.hasNextPage) break;
    cursor = page.endCursor;
  }

  const tokens: Token[] = nodes
    .map((node: any): Token | null => {
      try {
        if (!node || node.chainId !== 8453) return null;

        const addr = node.address?.toLowerCase();
        if (!addr) return null;

        const created = node.createdAt || null;

        let farcasterUrl = null;
        const f = node.creatorProfile?.socialAccounts?.farcaster?.username;
        if (f) farcasterUrl = `https://warpcast.com/${f.replace("@", "")}`;

        const t: Token = {
          token_address: addr,
          name: node.name || "",
          symbol: node.symbol || "",
          source: "zora",
          source_url: `https://zora.co/coins/base:${addr}`,
          first_seen_at: created,
          farcaster_url: farcasterUrl,
        };

        if (isBlocked(t.farcaster_url)) return null;

        return t;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Token[];

  return tokens.filter((t) => {
    if (!t.first_seen_at) return true;
    return now - new Date(t.first_seen_at).getTime() < WINDOW_MS;
  });
}

// =========================================
// 2) CLANKER tokens (3h)
// =========================================

export async function fetchTokensFromClanker(): Promise<Token[]> {
  const now = Date.now();
  const WINDOW_MS = 3 * 60 * 60 * 1000;
  const unix = Math.floor((now - WINDOW_MS) / 1000);

  let cursor: string | undefined = undefined;
  const list: any[] = [];

  for (let i = 0; i < 15; i++) {
    const q = new URLSearchParams({
      limit: "20",
      sort: "desc",
      startDate: String(unix),
      includeUser: "true",
    });

    if (cursor) q.set("cursor", cursor);

    const url = `${CLANKER_API}?${q.toString()}`;
    const json = await fetchJson(url);

    const data = json?.data || [];
    if (data.length === 0) break;

    list.push(...data);
    cursor = json.cursor;
    if (!cursor) break;
  }

  const tokens = list
    .map((t: any): Token | null => {
      if (t.chain_id !== 8453) return null;

      const addr = t.contract_address?.toLowerCase();
      if (!addr) return null;

      const handle =
        t.related?.user?.username ||
        t.related?.user?.handle ||
        t.related?.user?.name ||
        null;

      const farcasterUrl = handle
        ? `https://farcaster.xyz/${handle}`
        : undefined;

      const tok: Token = {
        token_address: addr,
        name: t.name || "",
        symbol: t.symbol || "",
        source: "clanker",
        source_url: `${CLANKER_FRONT}/clanker/${addr}`,
        first_seen_at: t.created_at || null,
        farcaster_url: farcasterUrl,
      };

      if (isBlocked(tok.farcaster_url)) return null;

      return tok;
    })
    .filter(Boolean) as Token[];

  return tokens.filter((t) => {
    if (!t.first_seen_at) return true;
    return now - new Date(t.first_seen_at).getTime() < WINDOW_MS;
  });
}

// =========================================
// 3) ENRICH MARKET (GeckoTerminal)
// =========================================

export async function enrichWithGeckoTerminal(
  tokens: Token[]
): Promise<TokenWithMarket[]> {
  const out: TokenWithMarket[] = [];

  for (const t of tokens) {
    try {
      const res = await fetch(`${GECKO_BASE_TOKENS}/${t.token_address}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        out.push({ ...t });
        continue;
      }

      const data = await res.json();
      const a = data?.data?.attributes || {};

      out.push({
        ...t,
        price_usd: safeNumber(a.price_usd),
        market_cap_usd:
          safeNumber(a.market_cap_usd) ||
          safeNumber(a.fdv_usd) ||
          safeNumber(a.fully_diluted_valuation_usd),
        liquidity_usd:
          safeNumber(a.liquidity_usd) || safeNumber(a.reserve_in_usd),
        volume_24h_usd:
          safeNumber(a.trade_volume_24h_usd) ||
          safeNumber(a.volume_24h_usd) ||
          safeNumber(a.volume_usd?.h24),
      });
    } catch {
      out.push({ ...t });
    }
  }

  return out;
}

// =========================================
// 4) FINAL aggregator
// =========================================

export async function getTokens(): Promise<TokenWithMarket[]> {
  const [zora, clanker] = await Promise.all([
    fetchTokensFromZora(),
    fetchTokensFromClanker(),
  ]);

  const map = new Map<string, Token>();

  [...zora, ...clanker].forEach((t) =>
    map.set(t.token_address.toLowerCase(), t)
  );

  const uniq = [...map.values()];
  return enrichWithGeckoTerminal(uniq);
}
