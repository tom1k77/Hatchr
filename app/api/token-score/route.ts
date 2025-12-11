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
    const fidParam = searchParams.get("fid");
    const usernameParam = searchParams.get("username");

    if (!fidParam && !usernameParam) {
      return NextResponse.json(
        { error: "Missing fid or username" },
        { status: 400 }
      );
    }

    // Формируем bulk-запрос
    const qs = fidParam
      ? `fids[]=${encodeURIComponent(fidParam)}`
      : `usernames[]=${encodeURIComponent(usernameParam!)}`;

    const url = `https://api.neynar.com/v2/farcaster/user/bulk?${qs}`;

    const resp = await fetch(url, {
      headers: {
        "api_key": NEYNAR_API_KEY,
      },
      cache: "no-store",
    });

    if (!resp.ok) {
      console.error("Neynar bulk error", resp.status);
      return NextResponse.json(
        { error: `Failed Neynar bulk: ${resp.status}` },
        { status: 500 }
      );
    }

    const json: any = await resp.json();

    const user = json.users?.[0];
    if (!user) {
      return NextResponse.json(
        { error: "User not found in Neynar bulk" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      fid: user.fid,
      username: user.username,
      creator_score: user.creator_score ?? null,
      engagement_score: user.engagement_score ?? null,
      follower_count: user.follower_count ?? null,
    });
  } catch (e) {
    console.error("token-score route error", e);
    return NextResponse.json(
      { error: "Internal error in token-score" },
      { status: 500 }
    );
  }
}
