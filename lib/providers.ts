// lib/providers.ts

export interface TokenItem {
  tokenAddress: string;
  name: string;
  symbol: string;
  source: string;
  sourceUrl: string;
  liquidityUsd: number | null;
  priceUsd: number | null;
  volume24hUsd: number | null;
  farcasterUrl: string | null;
  firstSeenAt: string | null;
}

export interface AggregatedTokens {
  count: number;
  items: TokenItem[];
}

export async function getTokens(): Promise<AggregatedTokens> {
  try {
    const url = "https://app.clanker.world/api/tokens?limit=20";
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      console.error("Clanker error:", res.status);
      return { count: 0, items: [] };
    }

    const data = await res.json();

    return {
      count: data.count ?? 0,
      items: (data.items ?? []).map((t: any) => ({
        tokenAddress: t.token_address,
        name: t.name,
        symbol: t.symbol,
        source: t.source,
        sourceUrl: t.source_url,
        liquidityUsd: t.liquidity_usd ?? null,
        priceUsd: t.price_usd ?? null,
        volume24hUsd: t.volume_24h_usd ?? null,
        farcasterUrl: t.farcaster_url ?? null,
        firstSeenAt: t.first_seen_at ?? null,
      })),
    };
  } catch (error) {
    console.error("Provider fetch error:", error);
    return { count: 0, items: [] };
  }
}
