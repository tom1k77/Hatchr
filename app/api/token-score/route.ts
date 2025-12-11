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

    if (!fidParam) {
      return NextResponse.json(
        { error: "Missing fid" },
        { status: 400 }
      );
    }

    // Берём инфу о пользователе по FID (bulk, но с одним fid)
    const url = `https://api.neynar.com/v2/farcaster/user/bulk?fids=${encodeURIComponent(
      fidParam
    )}`;

    const resp = await fetch(url, {
      headers: {
        // Neynar принимает api_key в заголовке; на всякий добавим и x-api-key
        api_key: NEYNAR_API_KEY,
        "x-api-key": NEYNAR_API_KEY,
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

    // Находим юзера в разных возможных форматах ответа
    const user =
      json.user ||
      json.result?.user ||
      (Array.isArray(json.users) ? json.users[0] : null) ||
      json;

    if (!user) {
      return NextResponse.json(
        { error: "User not found in Neynar response" },
        { status: 404 }
      );
    }

    const candidates = [
      user.score,
      user.neynar_user_score,
      user.experimental?.neynar_user_score,
      user.experimental?.user_score,
    ];

    let score: number | null = null;
    for (const c of candidates) {
      if (typeof c === "number" && Number.isFinite(c)) {
        score = c;
        break;
      }
    }

    return NextResponse.json({
      fid: Number(fidParam),
      username: user.username ?? null,
      score,
    });
  } catch (e) {
    console.error("token-score route error", e);
    return NextResponse.json(
      { error: "Internal error in token-score" },
      { status: 500 }
    );
  }
}
