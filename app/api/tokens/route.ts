// app/api/tokens/route.ts
import { NextResponse } from "next/server";
import { getTokens } from "@/lib/providers";

export async function GET() {
  try {
    const tokens = await getTokens();

    return NextResponse.json(
      {
        count: tokens.length,
        items: tokens,
      },
      {
        headers: {
          // чтобы не кешировалось браузером
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (e) {
    console.error("Tokens API error", e);
    return NextResponse.json(
      { error: "Failed to load tokens" },
      { status: 500 }
    );
  }
}
