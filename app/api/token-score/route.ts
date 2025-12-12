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
    obj?.experimental?.user_score,
    obj?.viewer_context?.neynar_user_score,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return clamp(c, 0, 1);
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

const EMPTY_FQ: FollowersQuality = {
  followers_sampled: 0,
  scored_followers: 0,
  avg_follower_score: null,
  power_badge_ratio: null,
  followers_quality: null,
};

async function fetchFollowersQuality(fid: number, limit = 50): Promise<FollowersQuality> {
  const url =
    `https://api.neynar.com/v2/farcaster/followers/?` +
    `fid=${encodeURIComponent(String(fid))}` +
    `&limit=${encodeURIComponent(String(limit))}` +
    `&sort_type=algorithmic`;

  const resp = await fetch(url, {
    headers: {
      "x-api-key": NEYNAR_API_KEY || "",
      "x-neynar-experimental": "true",
    },
    cache: "no-store",
  });

  if (!resp.ok) return EMPTY_FQ;

  const json: any = await resp.json();
  const rows: any[] = Array.isArray(json?.users) ? json.users : [];
  const sampled = rows.length;

  let scoredCount = 0;
  let scoreSum = 0;
  let powerBadgeCount = 0;

  for (const r of rows) {
    const u = r?.user ?? r;
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

  // пока оставим твою формулу
  const fq =
    avg === null || pbRatio === null ? null : clamp(0.85 * avg + 0.15 * pbRatio, 0, 1);

  return {
    followers_sampled: sampled,
    scored_followers: scoredCount,
    avg_follower_score: avg,
    power_badge_ratio: pbRatio,
    followers_quality: fq,
  };
}

async function fetchTokenMentions(address: string) {
  // Neynar: /v2/farcaster/cast/search/  + q=
  const q = address.toLowerCase();

  const url =
    `https://api.neynar.com/v2/farcaster/cast/search/?` +
    `q=${encodeURIComponent(q)}` +
    `&mode=literal&limit=25&sort_type=desc_chron`;

  const resp = await fetch(url, {
    headers: {
      "x-api-key": NEYNAR_API_KEY || "",
      "x-neynar-experimental": "true",
    },
    cache: "no-store",
  });

  if (!resp.ok) {
    return { mentions_count: 0, unique_authors: 0 };
  }

  const json: any = await resp.json();
  const casts: any[] = Array.isArray(json?.result?.casts) ? json.result.casts : [];

  const authors = new Set<number>();
  for (const c of casts) {
    const fid = c?.author?.fid;
    if (typeof fid === "number" && Number.isFinite(fid)) authors.add(fid);
  }

  return {
    mentions_count: casts.length,
    unique_authors: authors.size,
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
    const addressParam = searchParams.get("address"); // ✅ NEW

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

    const followersQuality =
      resolvedFid && Number.isFinite(resolvedFid)
        ? await fetchFollowersQuality(resolvedFid, 50)
        : EMPTY_FQ;

    const followers_quality = followersQuality.followers_quality;

    // ✅ hatchr_score: теперь отдаём готовый (0..1)
    const hatchr_score =
      creator_score != null && followers_quality != null
        ? clamp(0.6 * creator_score + 0.4 * followers_quality, 0, 1)
        : null;

    // ✅ mentions только если дали address
    const token_mentions =
      typeof addressParam === "string" && /^0x[0-9a-fA-F]{40}$/.test(addressParam.trim())
        ? await fetchTokenMentions(addressParam.trim())
        : null;

    return NextResponse.json({
      fid: resolvedFid,
      username: resolvedUsername,

      // ✅ BACK-COMPAT ДЛЯ ТВОЕГО ТЕКУЩЕГО UI
      neynar_score: creator_score,
      hatchr_score_v1: hatchr_score,

      // ✅ NEW
      creator_score,
      followers_quality,
      hatchr_score,

      follower_count,

      followers_analytics: {
        sample_size: followersQuality.followers_sampled,
        scored_followers: followersQuality.scored_followers,
        avg_follower_score: followersQuality.avg_follower_score,
        power_badge_ratio: followersQuality.power_badge_ratio,
        formula: "followers_quality = clamp(0.85*avg_follower_score + 0.15*power_badge_ratio)",
        sample_n: 50,
      },

      token_mentions,
    });
  } catch (e) {
    console.error("token-score route error", e);
    return NextResponse.json({ error: "Internal error in token-score" }, { status: 500 });
  }
}
