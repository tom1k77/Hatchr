// app/api/tokens/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Берём максимум 20 – это лимит Clanker
const CLANKER_URL =
  "https://www.clanker.world/api/tokens?sort=desc&limit=20";

type AggregatedToken = {
  tokenAddress: string;
  name: string;
  symbol: string;
  source: "clanker";
  sourceUrl: string;
  liquidityUsd: number | null;
  priceUsd: number | null;
  volume24hUsd: number | null;
  farcasterUrl: string | null;
  firstSeenAt: string | null;
};

// 1) Тянем сырые токены из Clanker
async function fetchClankerTokens(): Promise<AggregatedToken[]> {
  const res = await fetch(CLANKER_URL, { cache: "no-store" });
  const raw = await res.json();

  // В нормальном ответе должен быть массив в raw.data
  const data: any[] = Array.isArray(raw?.data)
    ? raw.data
    : Array.isArray(raw?.items)
    ? raw.items
    : [];

  const tokens: AggregatedToken[] = data
    .map((t: any) => {
      const addr: string | undefined =
        t.contract_address || t.token_address || t.address;

      if (!addr) return null;

      const sourceUrl =
        t.source_url ||
        (addr ? `https://www.clanker.world/clanker/${addr}` : "");

      return {
        tokenAddress: addr,
        name: t.name || "",
        symbol: t.symbol || "",
        source: "clanker" as const,
        sourceUrl,
        liquidityUsd: null,
        priceUsd: null,
        volume24hUsd: null,
        farcasterUrl: t.farcaster_url || null,
        firstSeenAt: t.first_seen_at || t.created || null,
      };
    })
    .filter(Boolean) as AggregatedToken[];

  return tokens;
}

// 2) Тянем маркет-дату с DexScreener по списку адресов
async function fetchDexScreenerData(
  addresses: string[]
): Promise<
  Record<
    string,
    { liquidityUsd: number | null; priceUsd: number | null; volume24hUsd: number | null }
  >
> {
  if (!addresses.length) return {};

  const unique = Array.from(new Set(addresses.map((a) => a.toLowerCase())));
  const url = `https://api.dexscreener.com/latest/dex/tokens/${unique.join(
    ","
  )}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return {};

    const json = await res.json();
    const pairs: any[] = Array.isArray(json?.pairs) ? json.pairs : [];

    const map: Record<
      string,
      { liquidityUsd: number | null; priceUsd: number | null; volume24hUsd: number | null }
    > = {};

    for (const p of pairs) {
      const baseAddr: string | undefined =
        p?.baseToken?.address?.toLowerCase();
      if (!baseAddr) continue;

      const liq = p?.liquidity?.usd ?? null;
      const price =
        typeof p?.priceUsd === "string" ? Number(p.priceUsd) : null;
      const vol = p?.volume?.h24 ?? null;

      const existing = map[baseAddr];
      // Берём пару с наибольшей ликвидностью, если их несколько
      if (!existing || (liq ?? 0) > (existing.liquidityUsd ?? 0)) {
        map[baseAddr] = {
          liquidityUsd: liq,
          priceUsd: price,
          volume24hUsd: vol,
        };
      }
    }

    return map;
  } catch {
    return {};
  }
}

// 3) Основной обработчик /api/tokens
export async function GET() {
  try {
    const clankerTokens = await fetchClankerTokens();

    // Адреса для DexScreener
    const addresses = clankerTokens.map((t) => t.tokenAddress);
    const dexMap = await fetchDexScreenerData(addresses);

    const enriched = clankerTokens.map((t) => {
      const key = t.tokenAddress.toLowerCase();
      const dex = dexMap[key];

      return {
        ...t,
        liquidityUsd: dex?.liquidityUsd ?? null,
        priceUsd: dex?.priceUsd ?? null,
        volume24hUsd: dex?.volume24hUsd ?? null,
      };
    });

    return NextResponse.json(
      {
        count: enriched.length,
        items: enriched,
      },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json(
      {
        error: String(e),
        count: 0,
        items: [],
      },
      { status: 500 }
    );
  }
}
