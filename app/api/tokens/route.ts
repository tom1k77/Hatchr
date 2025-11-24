// app/api/tokens/route.ts

import { NextResponse } from "next/server";
import { getTokens, TokenWithMarket } from "@/lib/providers";

export const revalidate = 0;

export async function GET() {
  try {
    const tokens: TokenWithMarket[] = await getTokens();

    const items = tokens.map((t) => ({
      token_address: t.token_address,
      name: t.name ?? "",
      symbol: t.symbol ?? "",
      source: t.source ?? "",
      source_url: t.source_url ?? "",
      image_url: t.image_url ?? "",
      first_seen_at: t.first_seen_at ?? null,

      price_usd: t.price_usd ?? null,
      market_cap_usd: t.market_cap_usd ?? null,
      liquidity_usd: t.liquidity_usd ?? null,
      volume_24h_usd: t.volume_24h_usd ?? null,

      farcaster_url: t.farcaster_url ?? null,
    }));

    return NextResponse.json({
      count: items.length,
      items,
    });
  } catch (e) {
    console.error("[/api/tokens] fatal error", e);

    // чтобы фронтенд не падал — всегда возвращаем корректную форму
    return NextResponse.json(
      {
        count: 0,
        items: [],
      },
      { status: 200 }
    );
  }
}
