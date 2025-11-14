import { NextResponse } from "next/server";
import {
  fetchTokensFromClanker,
  enrichWithDexScreener,
  TokenWithMarket,
} from "../../../lib/providers";

export async function GET() {
  try {
    // 1) базовые данные из Clanker
    const baseTokens = await fetchTokensFromClanker();

    // 2) обогащаем ценой / ликвидностью / объёмом
    const withMarket: TokenWithMarket[] = await enrichWithDexScreener(baseTokens);

    return NextResponse.json(
      { count: withMarket.length, items: withMarket },
      {
        headers: {
          "cache-control": "public, s-maxage=5, stale-while-revalidate=5",
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "failed" },
      { status: 500 }
    );
  }
}
