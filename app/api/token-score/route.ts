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

    // Можно звать либо по fid, либо по username — что есть, то и используем
    const qs = fidParam
      ? `fid=${encodeURIComponent(fidParam)}`
      : `username=${encodeURIComponent(usernameParam as string)}`;

    const url = `https://api.neynar.com/v2/farcaster/user?${qs}`;

    const resp = await fetch(url, {
      headers: {
        "x-api-key": NEYNAR_API_KEY,
        "x-neynar-experimental": "true",
      },
      cache: "no-store",
    });

    if (!resp.ok) {
      console.error("Neynar user error", resp.status);
      return NextResponse.json(
        { error: `Failed Neynar: ${resp.status}` },
        { status: 500 }
      );
    }

    const json: any = await resp.json();

    // Подстраховка: разные возможные места, где Neynar может положить score
    const u = json.user || json.result?.user || json;

    const candidates = [
      u?.score,
      u?.neynar_user_score,
      u?.experimental?.neynar_user_score,
      u?.experimental?.user_score,
    ];

    let score: number | null = null;
    for (const c of candidates) {
      if (typeof c === "number" && Number.isFinite(c)) {
        score = c;
        break;
      }
    }

    // Если Neynar вообще не вернул скор — оставляем null,
    // на фронте это показывается как "No data"
    return NextResponse.json({
      fid: fidParam ? Number(fidParam) : u?.fid ?? null,
      username: u?.username ?? usernameParam ?? null,
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
