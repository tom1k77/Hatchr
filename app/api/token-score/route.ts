// app/api/token-score/route.ts
import { NextRequest, NextResponse } from "next/server";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

function clamp(n: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, n));
}

function pickNeynarScore(obj: any): number | null {
  const candidates = [
    obj?.score,
    obj?.neynar_user_score,
    obj?.experimental?.neynar_user_score,
    obj?.experimental?.user_score,
    obj?.viewer_context?.neynar_user_score,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
  }
  return null;
}

async function fetchFirstOk(urls: string[]) {
  let lastStatus: number | null = null;
  let lastText: string | null = null;

  for (const url of urls) {
    const resp = await fetch(url, {
      headers: {
        "x-api-key": NEYNAR_API_KEY || "",
        "x-neynar-experimental": "true",
      },
      cache: "no-store",
    });

    if (resp.ok) {
      const json = await resp.json();
      return { ok: true as const, url, json };
    }

    lastStatus = resp.status;
    try {
      lastText = await resp.text();
    } catch {
      lastText = null;
    }
  }

  return { ok: false as const, status: lastStatus ?? 500, body: lastText };
}

type FollowersQuality = {
  followers_sampled: number;
  scored_followers: number;
  avg_follower_score: number | null;
  power_badge_ratio: number | null;
  followers_quality: number | null;
};

async function fetchFollowersQuality(fid: number, limit = 50): Promise<FollowersQuality> {
  // NOTE: можно поставить sort_type=algorithmic, но desc_chron тоже ок.
  const url =
    `https://api.neynar.com/v2/farcaster/followers?` +
    `fid=${encodeURIComponent(String(fid))}` +
    `&limit=${encodeURIComponent(String(limit))}` +
    `&sort_type=algorithmic`;

  const resp = await fetch(url, {
    headers: {
      "x-api-key": NEYNAR_API_KEY || "",
      "x-neynar-experimental": "true",
    },
    // небольшой кеш, чтобы не упираться в rate limit (особенно на проде)
    cache: "force-cache",
    next: { revalidate: 15 * 60 }, // 15 минут
  });

  if (!resp.ok) {
    return {
      followers_sampled: 0,
      scored_followers: 0,
      avg_follower_score: null,
      power_badge_ratio: null,
      followers_quality: null,
    };
  }

  const json: any = await resp.json();
  const rows: any[] = Array.isArray(json?.users) ? json.users : [];

  let sampled = rows.length;
  let scoredCount = 0;
  let scoreSum = 0;

  let powerBadgeCount = 0;

  for (const r of rows) {
    const u = r?.user ?? r; // на всякий случай
    const s = pickNeynarScore(u);

    if (typeof s === "number" && Number.isFinite(s)) {
      scoredCount += 1;
      scoreSum += clamp(s, 0, 1);
    }

    const pb =
      u?.power_badge ??
      u?.powerBadge ??
      u?.badges?.power_badge ??
      u?.badges?.powerBadge;

    if (pb === true) powerBadgeCount += 1;
  }

  const avg = scoredCount > 0 ? scoreSum / scoredCount : null;
  const pbRatio = sampled > 0 ? powerBadgeCount / sampled : null;

  const fq =
    avg === null || pbRatio === null
      ? null
      : clamp(0.85 * avg + 0.15 * pbRatio, 0, 1);

  return {
    followers_sampled: sampled,
    scored_followers: scoredCount,
    avg_follower_score: avg,
    power_badge_ratio: pbRatio,
    followers_quality: fq,
  };
}

export async function GET(req: NextRequest) {
  try {
    if (!NEYNAR_API_KEY) {
      return NextResponse.json({ error: "Missing NEYNAR_API_KEY" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const fidParam = searchParams.get("fid");
    const usernameParam = searchParams.get("username");

    if (!fidParam && !usernameParam) {
      return NextResponse.json({ error: "Missing fid or username" }, { status: 400 });
    }

    const fid = fidParam ? Number(fidParam) : null;
    const username = usernameParam ? String(usernameParam) : null;

    const urls: string[] = [];

    if (fid && Number.isFinite(fid)) {
      urls.push(
        `https://api.neynar.com/v2/farcaster/user/bulk?fids=${encodeURIComponent(String(fid))}`,
        `https://api.neynar.com/v2/farcaster/user?fid=${encodeURIComponent(String(fid))}`
      );
    } else if (username) {
      urls.push(
        `https://api.neynar.com/v2/farcaster/user/by_username?username=${encodeURIComponent(username)}`,
        `https://api.neynar.com/v2/farcaster/user?username=${encodeURIComponent(username)}`
      );
    }

    const result = await fetchFirstOk(urls);

    if (!result.ok) {
      console.error("Neynar user error", result.status, result.body);
      return NextResponse.json({ error: "Failed Neynar", status: result.status }, { status: 500 });
    }

    const json: any = result.json;

    const user =
      json?.user ??
      json?.result?.user ??
      (Array.isArray(json?.users) ? json.users[0] : null) ??
      (Array.isArray(json?.result?.users) ? json.result.users[0] : null) ??
      json;

    const creator_score = pickNeynarScore(user);

    const resolvedFid =
      (typeof user?.fid === "number" && Number.isFinite(user.fid) ? user.fid : null) ??
      (fid && Number.isFinite(fid) ? fid : null);

    const resolvedUsername = user?.username ?? username ?? null;

    const follower_count =
      (typeof user?.follower_count === "number" && Number.isFinite(user.follower_count)
        ? user.follower_count
        : null) ??
      (typeof user?.followers === "number" && Number.isFinite(user.followers) ? user.followers : null) ??
      null;

    // ✅ NEW: followers quality (N = 50)
    const followersQuality =
      resolvedFid && Number.isFinite(resolvedFid)
        ? await fetchFollowersQuality(resolvedFid, 50)
        : {
            followers_sampled: 0,
            scored_followers: 0,
            avg_follower_score: null,
            power_badge_ratio: null,
            followers_quality: null,
          };

    const followers_quality = followersQuality.followers_quality;

    const hatchr_score =
      typeof creator_score === "number" &&
      Number.isFinite(creator_score) &&
      typeof followers_quality === "number" &&
      Number.isFinite(followers_quality)
        ? clamp(0.6 * clamp(creator_score, 0, 1) + 0.4 * clamp(followers_quality, 0, 1), 0, 1)
        : null;

    return NextResponse.json({
      fid: resolvedFid,
      username: resolvedUsername,

      // ✅ scores
      creator_score,
      followers_quality,
      hatchr_score,

      // ✅ existing
      follower_count,

      // ✅ social analytics slice (для UI)
      followers_analytics: {
        sample_size: followersQuality.followers_sampled,
        scored_followers: followersQuality.scored_followers,
        avg_follower_score: followersQuality.avg_follower_score,
        power_badge_ratio: followersQuality.power_badge_ratio,
        formula: "followers_quality = clamp(0.85*avg_follower_score + 0.15*power_badge_ratio)",
        sample_n: 50,
      },

      // debug_source: result.url,
    });
  } catch (e) {
    console.error("token-score route error", e);
    return NextResponse.json({ error: "Internal error in token-score" }, { status: 500 });
  }
}
