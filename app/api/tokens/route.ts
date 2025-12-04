// app/api/tokens/route.ts
import { NextResponse } from "next/server";
import { getTokens } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tokens = await getTokens();

    return NextResponse.json({
      count: tokens.length,
      items: tokens.map((t) => ({
        token_address: t.token_address,
        name: t.name ?? "",
        symbol: t.symbol ?? "",
        source: t.source ?? "",
        source_url: t.source_url ?? "",
        first_seen_at: t.first_seen_at ?? null,

        price_usd: t.price_usd ?? null,
        market_cap_usd: t.market_cap_usd ?? null,
        liquidity_usd: t.liquidity_usd ?? null,
        volume_24h_usd: t.volume_24h_usd ?? null,

        farcaster_url: t.farcaster_url ?? null,
        x_url: t.x_url ?? null,
        telegram_url: t.telegram_url ?? null,
        website_url: t.website_url ?? null,
        instagram_url: t.instagram_url ?? null,
        tiktok_url: t.tiktok_url ?? null,
        image_url: t.image_url ?? null,

        // ВАЖНО: пробрасываем FID создателя!
        farcaster_fid: t.farcaster_fid ?? null,
      })),
    });
  } catch (e) {
    console.error("tokens api error", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
