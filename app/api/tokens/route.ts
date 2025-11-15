// app/api/tokens/route.ts
import { NextResponse } from "next/server";
import { fetchAggregatedTokens } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await fetchAggregatedTokens();
    return NextResponse.json({ count: items.length, items });
  } catch (e) {
    console.error("/api/tokens error", e);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 }
    );
  }
}
