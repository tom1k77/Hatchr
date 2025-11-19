// app/api/tokens/route.ts
import { NextResponse } from "next/server";
import { getTokens } from "@/lib/providers";

export const runtime = "nodejs"; // важно: НЕ edge

export async function GET() {
  try {
    const tokens = await getTokens();

    return NextResponse.json(
      {
        ok: true,
        count: tokens.length,
        items: tokens,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (e: any) {
    console.error("[API /tokens] Fatal error:", e?.message || e);
    return NextResponse.json(
      {
        ok: false,
        error: "Internal server error loading tokens",
      },
      { status: 500 }
    );
  }
}
