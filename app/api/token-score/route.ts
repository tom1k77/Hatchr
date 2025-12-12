// app/api/token-score/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

function clamp(n: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, n));
}

function pickNeynarScore(obj: any): number | null {
  const candidates = [
    obj?.score,
    obj?.neynar_user_score,
    obj?.experimental?.neynar_user_score,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return clamp(c, 0, 1);
  }
  return null;
}

async function fetchFirstOk(urls: string[]) {
  for (const url of urls) {
    const r = await fetch(url, {
      headers: {
        "x-api-key": NEYNAR_API_KEY || "",
        "x-neynar-experimental": "true",
      },
      cache: "no-store",
    });
    if (r.ok) return r.json();
  }
  return null;
}

/* ---------------- FOLLOWERS QUALITY ---------------- */

async function fetchFollowersQuality(fid: number, limit = 50) {
  const url =
    `https://api.neynar.com/v2/farcaster/followers/?fid=${fid}` +
    `&limit=${limit}&sort_type=algorithmic`;

  const r = await fetch(url, {
    headers: {
      "x-api-key": NEYNAR_API_KEY || "",
      "x-neynar-experimental": "true",
    },
    cache: "no-store",
  });

  if (!r.ok) return null;

  const json: any = await r.json();
  const rows = Array.isArray(json?.users) ? json.users : [];

  let scored = 0;
  let sum = 0;

  for (const row of rows) {
    const s = pickNeynarScore(row?.user);
    if (s != null) {
      scored++;
      sum += s;
    }
  }

  const avg = scored > 0 ? sum / scored : null;

  return {
    sample_size: rows.length,
    scored_followers: scored,
    avg_follower_score: avg,
    followers_quality: avg,
  };
}

/* ---------------- TOKEN MENTIONS ---------------- */

async function fetchTokenMentions(address: string) {
  const q = address.toLowerCase();

  const url =
    `https://api.neynar.com/v2/farcaster/cast/search?q=${q}` +
    `&mode=literal&limit=25`;

  const r = await fetch(url, {
    headers: {
      "x-api-key": NEYNAR_API_KEY || "",
      "x-neynar-experimental": "true",
    },
    cache: "no-store",
  });

  if (!r.ok) return null;

  const json: any = await r.json();
  const casts = json?.result?.casts ?? [];

  const authors = new Set<number>();

  casts.forEach((c: any) => {
    if (typeof c?.author?.fid === "number") {
      authors.add(c.author.fid);
    }
  });

  return {
    mentions_count: casts.length,
    unique_authors: authors.size,
  };
}

/* ---------------- MAIN ---------------- */

export async function GET(req: NextRequest) {
  if (!NEYNAR_API_KEY) {
    return NextResponse.json({ error: "Missing NEYNAR_API_KEY" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const fid = Number(searchParams.get("fid"));
  const username = searchParams.get("username");
  const address = searchParams.get("address");

  if (!fid && !username) {
    return NextResponse.json({ error: "Missing fid or username" }, { status: 400 });
  }

  const userJson = await fetchFirstOk(
    fid
      ? [
          `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
          `https://api.neynar.com/v2/farcaster/user?fid=${fid}`,
        ]
      : [
          `https://api.neynar.com/v2/farcaster/user/by_username?username=${username}`,
        ]
  );

  if (!userJson) {
    return NextResponse.json({ error: "Failed to load user" }, { status: 500 });
  }

  const user =
    userJson?.user ??
    userJson?.users?.[0] ??
    userJson?.result?.user ??
    null;

  const creator_score = pickNeynarScore(user);
  const followersQuality =
    typeof user?.fid === "number"
      ? await fetchFollowersQuality(user.fid)
      : null;

  const followers_quality = followersQuality?.followers_quality ?? null;

  const hatchr_score =
    creator_score != null && followers_quality != null
      ? clamp(0.6 * creator_score + 0.4 * followers_quality)
      : null;

  const tokenMentions =
    typeof address === "string" && address.startsWith("0x")
      ? await fetchTokenMentions(address)
      : null;

  return NextResponse.json({
    fid: user?.fid ?? null,
    username: user?.username ?? null,

    creator_score,
    followers_quality,
    hatchr_score,

    follower_count: user?.follower_count ?? null,

    followers_analytics: followersQuality,
    token_mentions: tokenMentions,
  });
}
