// app/api/tokens/route.ts
import { NextResponse } from "next/server";
import {
  fetchTokensFromClanker,
  enrichWithDexScreener,
  TokenWithMarket,
} from "@/lib/providers";

export const revalidate = 0;

export async function GET() {
  try {
    // 1. Берём свежие токены с Clanker (3 часа)
    const baseTokens = await fetchTokensFromClanker();

    // 2. Обогащаем маркет-данными с GeckoTerminal
    const withMarket: TokenWithMarket[] =
      await enrichWithDexScreener(baseTokens);

    // 3. Сортируем по времени создания (новые сверху)
    withMarket.sort((a, b) => {
      const ta = a.first_seen_at ? new Date(a.first_seen_at).getTime() : 0;
      const tb = b.first_seen_at ? new Date(b.first_seen_at).getTime() : 0;
      return tb - ta;
    });

    // 4. Приводим к формату API (под твой фронтенд)
    const items = withMarket.map((t) => ({
      token_address: t.token_address,
      name: t.name ?? "",
      symbol: t.symbol ?? "",
      source: t.source ?? "",
      source_url: t.source_url ?? "",
      first_seen_at: t.first_seen_at ?? "",
      // market data:
      market_cap_usd:
        typeof t.market_cap_usd === "number" ? t.market_cap_usd : null,
      price_usd: typeof t.price_usd === "number" ? t.price_usd : null,
      liquidity_usd:
        typeof t.liquidity_usd === "number" ? t.liquidity_usd : null,
      volume_24h_usd:
        typeof t.volume_24h_usd === "number" ? t.volume_24h_usd : null,
      // socials:
      farcaster_url: t.farcaster_url ?? null,
    }));

    return NextResponse.json(
      {
        count: items.length,
        items,
      },
      { status: 200 }
    );
  } catch (e) {
    console.error("Tokens API error:", e);
    return NextResponse.json(
      {
        count: 0,
        items: [],
        error: "failed_to_fetch_tokens",
      },
      { status: 500 }
    );
  }
}
