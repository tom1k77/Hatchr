// app/api/tokens/route.ts
import { NextResponse } from "next/server";
import { fetchTokensFromClanker } from "../../../lib/providers";

const S_MAX_AGE = 60;
const STALE_WHILE_REVALIDATE = 30;

export async function GET() {
  try {
    const items = await fetchTokensFromClanker();

    return NextResponse.json(
      { count: items.length, items },
      {
        headers: {
          "cache-control": `public, s-maxage=${S_MAX_AGE}, stale-while-revalidate=${STALE_WHILE_REVALIDATE}`,
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
