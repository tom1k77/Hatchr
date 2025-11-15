// app/api/farcaster-profile/route.ts
import { NextResponse } from "next/server";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const username = searchParams.get("username");

  if (!username) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  if (!NEYNAR_API_KEY) {
    console.error("NEYNAR_API_KEY is not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  try {
    const url = `https://api.neynar.com/v2/farcaster/user/by_username/?username=${encodeURIComponent(
      username
    )}`;

    const res = await fetch(url, {
      headers: {
        "x-api-key": NEYNAR_API_KEY,
        "x-neynar-experimental": "false",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Neynar error", res.status, text);
      return NextResponse.json(
        { error: "Failed to fetch profile" },
        { status: 500 }
      );
    }

    const data = await res.json();
    const user = data.user;

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Берём pfp из любых доступных полей
    const pfpUrl =
      user.pfp_url ||
      (user.pfp && (user.pfp.url || user.pfp.source_url)) ||
      null;

    return NextResponse.json({
      username: user.username,
      display_name: user.display_name,
      pfp_url: pfpUrl,
      follower_count: user.follower_count ?? 0,
      following_count: user.following_count ?? 0,
    });
  } catch (e) {
    console.error("Neynar request failed", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
