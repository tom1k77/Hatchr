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
    obj?.experimental?.score,
    obj?.viewer_context?.neynar_user_score,
    obj?.viewer_context?.score,
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
        accept: "application/json",
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

async function fetchFollowersQuality(fid: number, limit = 150): Promise<FollowersQuality> {
  const url =
    `https://api.neynar.com/v2/farcaster/followers/?` +
    `fid=${encodeURIComponent(String(fid))}` +
    `&limit=${encodeURIComponent(String(limit))}` +
    `&sort_type=algorithmic`;

  const resp = await fetch(url, {
    headers: {
      "x-api-key": NEYNAR_API_KEY || "",
      "x-neynar-experimental": "true",
      accept: "application/json",
    },
    cache: "no-store",
  });

  if (!resp.ok) return EMPTY_FQ;

  const json: any = await resp.json();

  // Neynar бывает: json.users или json.result.users
  const rows: any[] = Array.isArray(json?.users)
    ? json.users
    : Array.isArray(json?.result?.users)
      ? json.result.users
      : [];

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

  // если pbRatio не посчитался — считаем как 0, чтобы не получить null
  const fq =
    avg == null
      ? null
      : clamp(0.85 * avg + 0.15 * (typeof pbRatio === "number" ? pbRatio : 0), 0, 1);

  return {
    followers_sampled: sampled,
    scored_followers: scoredCount,
    avg_follower_score: avg,
    power_badge_ratio: pbRatio,
    followers_quality: fq,
  };
}

async function fetchTokenMentions(address: string) {
  const q = address.toLowerCase();

  const url =
    `https://api.neynar.com/v2/farcaster/cast/search/?` +
    `q=${encodeURIComponent(q)}` +
    `&mode=literal&limit=25&sort_type=desc_chron`;

  const resp = await fetch(url, {
    headers: {
      "x-api-key": NEYNAR_API_KEY || "",
      "x-neynar-experimental": "true",
      accept: "application/json",
    },
    cache: "no-store",
  });

  if (!resp.ok) {
    return { mentions_count: 0, unique_authors: 0, casts: [] as any[] };
  }

  const json: any = await resp.json();
  const castsRaw: any[] = Array.isArray(json?.result?.casts) ? json.result.casts : [];

  const authors = new Set<number>();

  const casts = castsRaw.slice(0, 15).map((c) => {
    const fid = c?.author?.fid;
    if (typeof fid === "number" && Number.isFinite(fid)) authors.add(fid);

    const hash: string | null = typeof c?.hash === "string" ? c.hash : null;
    const authorUsername: string | null = typeof c?.author?.username === "string" ? c.author.username : null;
    const shortHash = hash ? hash.slice(0, 10) : null; // 0x + 8
    const farcasterUrl = authorUsername && shortHash ? `https://farcaster.xyz/${authorUsername}/${shortHash}` : null;

    return {
      hash,
      farcasterUrl,
      timestamp: c?.timestamp ?? c?.created_at ?? null,
      text: c?.text ?? "",
      author: {
        fid: c?.author?.fid ?? null,
        username: authorUsername,
        display_name: c?.author?.display_name ?? null,
        pfp_url: c?.author?.pfp_url ?? null,
      },
    };
  });

  return {
    mentions_count: castsRaw.length,
    unique_authors: authors.size,
    casts,
  };
}

async function fetchCreatorContext(
  fid: number,
  tokenCreatedAt?: string | null,
  tokenName?: string | null,
  tokenSymbol?: string | null,
  address?: string | null
) {
  const url =
    `https://api.neynar.com/v2/farcaster/feed/user/casts?` +
    `fid=${encodeURIComponent(String(fid))}&limit=100`;

  const resp = await fetch(url, {
    headers: {
      "x-api-key": NEYNAR_API_KEY || "",
      "x-neynar-experimental": "true",
      accept: "application/json",
    },
    cache: "no-store",
  });

  if (!resp.ok) {
    return { classification: "unknown", checked: 0, matches: 0, earliest_match_ts: null };
  }

  const json: any = await resp.json();
  const casts: any[] =
    Array.isArray(json?.casts) ? json.casts : Array.isArray(json?.result?.casts) ? json.result.casts : [];

  const createdMs = tokenCreatedAt ? Date.parse(tokenCreatedAt) : NaN;

  const needles = [tokenName?.trim(), tokenSymbol?.trim(), address?.trim()?.toLowerCase()]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());

  let matches = 0;
  let earliestBefore: string | null = null;

  for (const c of casts) {
    const text = String(c?.text ?? "").toLowerCase();
    if (!text) continue;

    const hit = needles.some((n) => n && text.includes(n));
    if (!hit) continue;

    matches += 1;

    const ts = c?.timestamp ?? c?.created_at ?? null;
    if (!ts) continue;

    if (Number.isFinite(createdMs)) {
      const t = Date.parse(ts);
      if (Number.isFinite(t) && t < createdMs) {
        earliestBefore =
          earliestBefore == null ? ts : Date.parse(ts) < Date.parse(earliestBefore) ? ts : earliestBefore;
      }
    }
  }

  const classification =
    earliestBefore
      ? "ongoing_build_or_preannounced"
      : matches > 0
        ? "mentioned_but_no_timestamp_context"
        : "fresh_launch_or_unknown";

  return { classification, checked: casts.length, matches, earliest_match_ts: earliestBefore };
}

export async function GET(req: NextRequest) {
  try {
    if (!NEYNAR_API_KEY) {
      return NextResponse.json({ error: "Missing NEYNAR_API_KEY" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const fidParam = searchParams.get("fid");
    const usernameParam = searchParams.get("username");
    const addressParam = searchParams.get("address");

    const tokenCreatedAt = searchParams.get("tokenCreatedAt");
    const tokenName = searchParams.get("tokenName");
    const tokenSymbol = searchParams.get("tokenSymbol");

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
        ? await fetchFollowersQuality(resolvedFid, 150)
        : EMPTY_FQ;

    const followers_quality = followersQuality.followers_quality;

    // fallback: если чего-то нет — всё равно отдаём скор по доступному
    let hatchr_score: number | null = null;
    if (creator_score != null && followers_quality != null) {
      hatchr_score = clamp(0.6 * creator_score + 0.4 * followers_quality, 0, 1);
    } else if (creator_score != null) {
      hatchr_score = clamp(creator_score, 0, 1);
    } else if (followers_quality != null) {
      hatchr_score = clamp(followers_quality, 0, 1);
    }

    const token_mentions =
      typeof addressParam === "string" && /^0x[0-9a-fA-F]{40}$/.test(addressParam.trim())
        ? await fetchTokenMentions(addressParam.trim())
        : null;

    const creator_context =
      resolvedFid && Number.isFinite(resolvedFid)
        ? await fetchCreatorContext(resolvedFid, tokenCreatedAt, tokenName, tokenSymbol, addressParam)
        : null;

    return NextResponse.json({
      fid: resolvedFid,
      username: resolvedUsername,

      // BACK-COMPAT
      neynar_score: creator_score,
      hatchr_score_v1: hatchr_score,

      // NEW
      creator_score,
      followers_quality,
      hatchr_score,
      follower_count,

      followers_analytics: {
        sample_size: followersQuality.followers_sampled,
        scored_followers: followersQuality.scored_followers,
        avg_follower_score: followersQuality.avg_follower_score,
        power_badge_ratio: followersQuality.power_badge_ratio,
        formula: "followers_quality = clamp(0.85*avg_follower_score + 0.15*power_badge_ratio_or_0)",
        sample_n: 150,
      },

      token_mentions,
      creator_context,
    });
  } catch (e) {
    console.error("token-score route error", e);
    return NextResponse.json({ error: "Internal error in token-score" }, { status: 500 });
  }
}
