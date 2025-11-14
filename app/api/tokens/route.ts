import { NextResponse } from "next/server";
import { fetchTokensFromClanker } from "../../../lib/providers";

export async function GET() {
  try {
    const items = await fetchTokensFromClanker();

    return NextResponse.json(
      { count: items.length, items },
      {
        headers: {
          "cache-control": "public, s-maxage=60, stale-while-revalidate=30",
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
