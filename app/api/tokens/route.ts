// app/api/tokens/route.ts
import { NextResponse } from "next/server";
import { fetchClankerTokens, AggregatedToken } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const clankerTokens: AggregatedToken[] = await fetchClankerTokens(200);

    return NextResponse.json(
      {
        count: clankerTokens.length,
        items: clankerTokens,
      },
      { status: 200 }
    );
  } catch (e) {
    console.error("/api/tokens failed", e);
    return NextResponse.json(
      { count: 0, items: [], error: "internal_error" },
      { status: 500 }
    );
  }
}
