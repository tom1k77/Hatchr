// lib/providers.ts

// Тип, который использует и API, и главная страница
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

    // marketCap или fdv
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

  // Разбираем ответ очень защищённо,
  // т.к. структура может быть разной
  let rawItems: any[] = [];

  if (Array.isArray(json)) {
    rawItems = json;
  } else if (json.items && Array.isArray(json.items)) {
    rawItems = json.items;
  } else if (json.data && Array.isArray(json.data)) {
    rawItems = json.data;
  } else if (json.tokens && Array.isArray(json.tokens)) {
    rawItems = json.tokens;
  } else {
    const firstArray = Object.values(json).find((v) => Array.isArray(v));
    if (Array.isArray(firstArray)) {
      rawItems = firstArray as any[];
    }
  }

  // Если совсем пусто – хотя бы не крашимся
  if (!rawItems || rawItems.length === 0) {
    console.warn("Clanker: no items in response");
    return [];
  }

  const mapped: AggregatedToken[] = rawItems
    .map((t: any) => {
      const firstSeen =
        t.first_seen_at ?? t.created_at ?? t.created ?? null;
      if (!firstSeen) return null;

      const tokenAddress =
        t.token_address ?? t.address ?? t.token ?? null;
      if (!tokenAddress) return null;

      const sourceUrl =
        t.source_url ??
        (tokenAddress
          ? `https://www.clanker.world/clanker/${tokenAddress}`
          : "");

      return {
        token_address: tokenAddress,
        name: t.name ?? "",
        symbol: t.symbol ?? "",
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

  // СОРТИРУЕМ по времени (новые сверху),
  // но НЕ ФИЛЬТРУЕМ по последнему часу, чтобы точно что-то показывать
  mapped.sort(
    (a, b) =>
      Date.parse(b.first_seen_at) - Date.parse(a.first_seen_at)
  );

  return mapped;
}

// ---------- Aggregator ----------

export async function fetchAggregatedTokens(): Promise<AggregatedToken[]> {
  const clankerTokens = await fetchTokensFromClanker();

  // ограничим количество запросов к DexScreener
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

  // остальные токены будут без marketCapUsd (покажем "—")
  return clankerTokens;
}
