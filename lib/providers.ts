// lib/providers.ts

export interface TokenFromApi {
  address?: string;
  token_address?: string;
  name?: string;
  symbol?: string;
  createdAt?: string;
  created_at?: string;
  pageUrl?: string;
  links?: {
    website?: string;
    twitter?: string;
    x?: string;
    farcaster?: string;
    telegram?: string;
  };
}

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

// адрес публичного API Clanker
const CLANKER_URL = "https://www.clanker.world/api/tokens";

// простой fetch с таймаутом
async function fetchJson(url: string, init?: RequestInit) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);

  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`${url} ${res.status}`);
    }
    return (await res.json()) as any;
  } finally {
    clearTimeout(t);
  }
}

// получаем сырые токены из Clanker
export async function fetchTokensFromClanker(): Promise<Token[]> {
  const json = await fetchJson(CLANKER_URL);

  // возможные варианты формата
  const items: TokenFromApi[] = Array.isArray(json)
    ? json
    : Array.isArray(json?.items)
    ? json.items
    : Array.isArray(json?.tokens)
    ? json.tokens
    : [];

  const normalized: Token[] = items
    .map((c) => {
      const addr = (c.address || c.token_address || "").toLowerCase();
      if (!addr) return null;

      return {
        token_address: addr,
        name: c.name || "",
        symbol: c.symbol || "",
        source: "clanker",
        source_url:
          c.pageUrl ||
          (c.address ? `https://www.clanker.world/token/${c.address}` : undefined),
        first_seen_at: c.createdAt || c.created_at,
        website_url: c.links?.website,
        x_url: c.links?.twitter || c.links?.x,
        farcaster_url: c.links?.farcaster,
        telegram_url: c.links?.telegram,
      } as Token;
    })
    .filter(Boolean) as Token[];

  return normalized;
}
