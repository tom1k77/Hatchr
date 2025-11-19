import { NextResponse } from "next/server";
import { getTokens } from "@/lib/providers";

export const revalidate = 15;

export async function GET() {
  try {
    const tokens = await getTokens();

    return NextResponse.json(
      {
        ok: true,
        count: tokens.length,
        tokens,
      },
      { status: 200 }
    );

  } catch (e: any) {
    console.error("FATAL /api/tokens error:", e);

    return NextResponse.json(
      {
        ok: false,
        error: "internal_error",
        message: e?.message || "failed to fetch tokens",
        tokens: [],
      },
      { status: 500 }
    );
  }
}
