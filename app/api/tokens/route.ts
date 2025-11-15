import { NextResponse } from "next/server";
import { fetchTokensFromClanker } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await fetchTokensFromClanker();

    return NextResponse.json(
      {
        count: items.length,
        items,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("API /api/tokens error:", error);

    return NextResponse.json(
      {
        count: 0,
        items: [],
        error: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
