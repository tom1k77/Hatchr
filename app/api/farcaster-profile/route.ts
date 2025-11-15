// app/api/farcaster-profile/route.ts
import { NextRequest, NextResponse } from "next/server";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || "";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");

  if (!username) {
    return NextResponse.json(
      { error: "username_required" },
      { status: 400 }
    );
  }

  if (!NEYNAR_API_KEY) {
    console.error("NEYNAR_API_KEY is not set");
    return NextResponse.json(
      { error: "neynar_key_missing" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/user-by-username?username=${encodeURIComponent(
        username
      )}`,
      {
        headers: {
          accept: "application/json",
          api_key: NEYNAR_API_KEY,
        },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      console.error("Neynar error", res.status, await res.text());
      return NextResponse.json(
        { error: "neynar_failed" },
        { status: 500 }
      );
    }

    const data = await res.json();

    const user =
      data.user ??
      data.result?.user ??
      data.result?.users?.[0];

    if (!user) {
      return NextResponse.json(
        { error: "user_not_found" },
        { status: 404 }
      );
    }

    const profile = {
      username: user.username,
      displayName:
        user.display_name ??
        user.displayName ??
        null,
      pfpUrl:
        user.pfp_url ??
        user.pfp?.url ??
        null,
      followers:
        user.follower_count ??
        user.followerCount ??
        0,
      following:
        user.following_count ??
        user.followingCount ??
        0,
      bio: user.profile?.bio?.text ?? "",
      fid: user.fid ?? null,
    };

    return NextResponse.json(profile);
  } catch (e) {
    console.error("Neynar fetch error", e);
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 }
    );
  }
}
