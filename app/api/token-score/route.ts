// app/api/token-score/route.ts
import { NextRequest, NextResponse } from "next/server";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

export async function GET(req: NextRequest) {
  try {
    if (!NEYNAR_API_KEY) {
      return NextResponse.json(
        { error: "Missing NEYNAR_API_KEY" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const username = searchParams.get("username");

    if (!username) {
      return NextResponse.json(
        { error: "Missing username" },
        { status: 400 }
      );
    }

    const url = `https://api.neynar.com/v2/farcaster/user?username=${encodeURIComponent(
      username
    )}`;

    const resp = await fetch(url, {
      headers: {
        "x-api-key": NEYNAR_API_KEY,
        "x-neynar-experimental": "true",
      },
      cache: "no-store",
    });

    if (!resp.ok) {
      console.error("Neynar error", resp.status);
      return NextResponse.json(
        { error: "Failed Neynar" },
        { status: 500 }
      );
    }

    const json = await resp.json();

    const score =
      json?.user?.score ??
      json?.user?.experimental?.neynar_user_score ??
      0;

    return NextResponse.json({
      username,
      score: typeof score === "number" ? score : 0,
    });
  } catch (e) {
    console.error("token-score error", e);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
