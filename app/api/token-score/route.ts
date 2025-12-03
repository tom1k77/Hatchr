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
    const fid = searchParams.get("fid");

    if (!fid) {
      return NextResponse.json(
        { error: "Missing fid" },
        { status: 400 }
      );
    }

    const url = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`;

    const resp = await fetch(url, {
      headers: {
        "x-api-key": NEYNAR_API_KEY,
        "x-neynar-experimental": "true",
      },
      cache: "no-store",
    });

    if (!resp.ok) {
      console.error("Neynar score error", resp.status);
      return NextResponse.json(
        { error: "Neynar error", status: resp.status },
        { status: 500 }
      );
    }

    const json = await resp.json();

    const rawUser = Array.isArray(json.users)
      ? json.users[0]?.user ?? json.users[0]
      : json.user;

    let score: unknown =
      rawUser?.score ?? rawUser?.experimental?.neynar_user_score ?? 0;

    if (typeof score !== "number") {
      score = 0;
    }

    return NextResponse.json({
      fid: Number(fid),
      score,
    });
  } catch (e) {
    console.error("token-score error", e);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
