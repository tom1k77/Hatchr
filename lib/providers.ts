// lib/providers.ts

export type AggregatedToken = {
  token_address: string;
  name: string;
  symbol: string;
  source: string;
  source_url: string;
  first_seen_at: string;
  farcaster_url?: string | null;

  // рыночные данные
  priceUsd?: number | null;
  volume24hUsd?: number | null;
  marketCapUsd?: number | null;
};

const CLANKER_API = "https://www.clanker.world/api/tokens";

// ---------- DexScreener ----------

export type DexScreenerData = {
  priceUsd: number | null;
  volume24hUsd: number | null;
  marketCapUsd: number | null;
};

export async function fetchDexScreenerData(
  tokenAddress: string
): Promise<DexScreenerData | null> {
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
    const res = await fetch(url, {
      next: { revalidate: 30 }, // кэшируем на 30 сек
    });

    if (!res.ok) return null;

    const data = await res.json();

    if (!data.pairs || !Array.isArray(data.pairs) || data.pairs.length === 0) {
      return null;
    }

    // берём пару на Base, если есть
    const pair =
      data.pairs.find((p: any) => p.chainId === "base") ?? data.pairs[0];

    const priceUsd = pair.priceUsd ? Number(pair.priceUsd) : null;

    const volume24hUsd =
      pair.volume && typeof pair.volume.h24 === "number"
        ? pair.volume.h24
        : null;

    const marketCapUsd =
      typeof pair.marketCap === "number"
        ? pair.marketCap
        : typeof pair.fdv === "number"
        ? pair.fdv
        : null;

    return {
      priceUsd,
      volume24hUsd,
      marketCapUsd,
    };
  } catch (e) {
    console.error("DexScreener error", e);
    return null;
  }
}

// ---------- Clanker ----------

async function fetchTokensFromClanker(): Promise<AggregatedToken[]> {
  const url = `${CLANKER_API}?sort=desc&limit=200`;

  const res = await fetch(url, {
    cache: "no-store",
  });

  if (!res.ok) {
    console.error("Clanker API error", await res.text());
    return [];
  }

  const json = await res.json();

  const rawItems: any[] =
    (json && (json.items || json.data || json.tokens)) ?? [];

  const now = Date.now();
  const cutoff = now - 60 * 60 * 1000; // последние 60 минут

  const mapped: AggregatedToken[] = rawItems
    .map((t: any) => {
      const firstSeen = t.first_seen_at ?? t.created_at ?? t.created ?? null;
      if (!firstSeen) return null;

      const sourceUrl =
        t.source_url ??
        (t.token_address
          ? `https://www.clanker.world/clanker/${t.token_address}`
          : "");

      return {
        token_address: t.token_address,
        name: t.name,
        symbol: t.symbol,
        source: "clanker",
        source_url: sourceUrl,
        first_seen_at: firstSeen,
        farcaster_url: t.farcaster_url ?? null,
        priceUsd: null,
        volume24hUsd: null,
        marketCapUsd: null,
      } as AggregatedToken;
    })
    .filter(Boolean) as AggregatedToken[];

  // фильтруем по времени
  const recent = mapped.filter((t) => {
    const ts = Date.parse(t.first_seen_at);
    return !Number.isNaN(ts) && ts >= cutoff;
  });

  // новые сверху
  recent.sort(
    (a, b) =>
      Date.parse(b.first_seen_at) - Date.parse(a.first_seen_at)
  );

  return recent;
}

// ---------- Aggregator ----------

export async function fetchAggregatedTokens(): Promise<AggregatedToken[]> {
  const clankerTokens = await fetchTokensFromClanker();

  // ограничим количество запросов к DexScreener, чтобы не словить rate limit
  const MAX_DEX_REQUESTS = 40;
  const tokensForDex = clankerTokens.slice(0, MAX_DEX_REQUESTS);

  await Promise.all(
    tokensForDex.map(async (token) => {
      const dex = await fetchDexScreenerData(token.token_address);
      if (dex) {
        token.priceUsd = dex.priceUsd;
        token.volume24hUsd = dex.volume24hUsd;
        token.marketCapUsd = dex.marketCapUsd;
      }
    })
  );

  // остальные токены остаются без marketCapUsd (покажем "—")
  return clankerTokens;
}
