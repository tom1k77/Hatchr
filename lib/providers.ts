// lib/providers.ts

export type AggregatedToken = {
  token_address: string;
  name: string;
  symbol: string;
  source: "clanker";
  source_url: string;
  first_seen_at: string;
  farcaster_url?: string | null;
  liquidityUsd?: number | null;
  priceUsd?: number | null;
  volume24hUsd?: number | null;
};

// ---------- CLANKER ----------

export async function fetchClankerTokens(limit = 200): Promise<AggregatedToken[]> {
  const url = `https://www.clanker.world/api/tokens?sort=desc&limit=${limit}`;

  let res: Response;
  try {
    res = await fetch(url, {
      next: { revalidate: 10 },
    });
  } catch (e) {
    console.error("Clanker fetch error", e);
    return [];
  }

  if (!res.ok) {
    console.error("Clanker API HTTP error", res.status);
    return [];
  }

  let json: any;
  try {
    json = await res.json();
  } catch (e) {
    console.error("Clanker JSON parse error", e);
    return [];
  }

  // Пытаемся найти массив токенов в разных возможных местах
  let rawItems: any[] = [];

  if (Array.isArray(json)) {
    rawItems = json;
  } else if (Array.isArray(json.items)) {
    rawItems = json.items;
  } else if (Array.isArray(json.data)) {
    rawItems = json.data;
  } else if (json.data && Array.isArray(json.data.items)) {
    rawItems = json.data.items;
  } else if (json.data && Array.isArray(json.data.tokens)) {
    rawItems = json.data.tokens;
  } else {
    // последний шанс — берём первый массив в объекте
    const firstArrKey = Object.keys(json).find((k) =>
      Array.isArray((json as any)[k])
    );
    if (firstArrKey) {
      rawItems = (json as any)[firstArrKey];
    }
  }

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    console.error("Clanker: no token array found in response");
    return [];
  }

  const mapped: AggregatedToken[] = rawItems
    .map((item: any) => {
      const t = item.token ?? item;

      const addr: string =
        t.token_address ??
        t.contract_address ??
        item.token_address ??
        item.contract_address ??
        "";

      if (!addr) return null;

      const name: string = t.name ?? item.name ?? "";
      const symbol: string = t.symbol ?? item.symbol ?? "";

      const created: string =
        t.first_seen_at ??
        t.created ??
        item.first_seen_at ??
        item.created ??
        new Date().toISOString();

      // пробуем вытащить ссылку на фаркастер
      let farcasterUrl: string | null = null;
      const m = t.metadata ?? item.metadata;
      if (m) {
        if (typeof m.farcaster_url === "string") farcasterUrl = m.farcaster_url;
        else if (typeof m.social_url === "string") farcasterUrl = m.social_url;
        else if (typeof m.creator_url === "string") farcasterUrl = m.creator_url;
      }

      const sourceUrl = `https://www.clanker.world/clanker/${addr}`;

      const base: AggregatedToken = {
        token_address: addr,
        name,
        symbol,
        source: "clanker",
        source_url: sourceUrl,
        first_seen_at: created,
        farcaster_url: farcasterUrl,
        liquidityUsd: null,
        priceUsd: null,
        volume24hUsd: null,
      };

      return base;
    })
    .filter(Boolean) as AggregatedToken[];

  const withDex = await attachDexScreenerData(mapped);
  return withDex;
}

// ---------- DEXSCREENER ----------

type DexInfo = {
  liquidityUsd: number | null;
  priceUsd: number | null;
  volume24hUsd: number | null;
};

async function fetchDexForToken(address: string): Promise<DexInfo | null> {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${address}`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      return null;
    }

    const json: any = await res.json();
    const pair = Array.isArray(json.pairs) ? json.pairs[0] : null;
    if (!pair) return null;

    const liquidityUsd =
      typeof pair.liquidity?.usd === "number" ? pair.liquidity.usd : null;

    let priceUsd: number | null = null;
    if (pair.priceUsd) {
      const p = Number(pair.priceUsd);
      priceUsd = Number.isFinite(p) ? p : null;
    }

    let volume24hUsd: number | null = null;
    if (pair.volume?.h24 != null) {
      const v = Number(pair.volume.h24);
      volume24hUsd = Number.isFinite(v) ? v : null;
    }

    return { liquidityUsd, priceUsd, volume24hUsd };
  } catch (e) {
    console.error("DexScreener error for", address, e);
    return null;
  }
}

/**
 * Подмешиваем DexScreener к первым 50 токенам,
 * чтобы не улететь в лимиты.
 */
async function attachDexScreenerData(
  tokens: AggregatedToken[]
): Promise<AggregatedToken[]> {
  const maxDex = 50;
  const slice = tokens.slice(0, maxDex);
  const rest = tokens.slice(maxDex);

  const dedupAddresses = Array.from(
    new Set(slice.map((t) => t.token_address.toLowerCase()))
  );

  const results: Record<string, DexInfo> = {};

  await Promise.all(
    dedupAddresses.map(async (addr) => {
      const info = await fetchDexForToken(addr);
      if (info) {
        results[addr] = info;
      }
    })
  );

  const mergeOne = (t: AggregatedToken): AggregatedToken => {
    const info = results[t.token_address.toLowerCase()];
    if (!info) return t;
    return {
      ...t,
      liquidityUsd: info.liquidityUsd,
      priceUsd: info.priceUsd,
      volume24hUsd: info.volume24hUsd,
    };
  };

  return [...slice.map(mergeOne), ...rest];
}
