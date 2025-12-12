// app/api/token-score/route.ts
import { NextRequest, NextResponse } from "next/server";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

type FetchOk =
  | { ok: true; url: string; json: any }
  | { ok: false; status: number; body: string | null };

async function fetchJson(url: string): Promise<FetchOk> {
  let lastText: string | null = null;

  try {
    const resp = await fetch(url, {
      headers: {
        "x-api-key": NEYNAR_API_KEY || "",
        "x-neynar-experimental": "true",
      },
      cache: "no-store",
    });

    if (resp.ok) {
      const json = await resp.json();
      return { ok: true, url, json };
    }

    try {
      lastText = await resp.text();
    } catch {
      lastText = null;
    }

    return { ok: false, status: resp.status, body: lastText };
  } catch (e: any) {
    return { ok: false, status: 500, body: e?.message ?? String(e) };
  }
}

async function fetchFirstOk(urls: string[]) {
  let lastStatus: number | null = null;
  let lastText: string | null = null;

  for (const url of urls) {
    const res = await fetchJson(url);
    if (res.ok) return res;

    lastStatus = res.status;
    lastText = res.body ?? null;
  }

  return { ok: false as const, status: lastStatus ?? 500, body: lastText };
}

function pickNeynarUser(json: any) {
  return (
    json?.user ??
    json?.result?.user ??
    (Array.isArray(json?.users) ? json.users[0] : null) ??
    (Array.isArray(json?.result?.users) ? json.result.users[0] : null) ??
    json ??
    null
  );
}

function pickNeynarScore(user: any): number | null {
  const candidates = [
    user?.score,
    user?.neynar_user_score,
    user?.experimental?.neynar_user_score,
    user?.experimental?.user_score,
    user?.viewer_context?.neynar_user_score,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
  }
  return null;
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function median(nums: number[]) {
  if (!nums.length) return null;
  const arr = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  if (arr.length % 2 === 0) return (arr[mid - 1] + arr[mid]) / 2;
  return arr[mid];
}

function isValidEthAddress(addr: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function toIsoNoMs(d: Date) {
  // Neynar accepts date or date-time; this is safe ISO without ms
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function sumEngagement(cast: any) {
  const likes = Number(cast?.reactions?.likes_count ?? 0) || 0;
  const recasts = Number(cast?.reactions?.recasts_count ?? 0) || 0;
  const replies = Number(cast?.replies?.count ?? 0) || 0;
  return likes + recasts + replies;
}

/**
 * Fetch casts mentioning a contract address, newest-first.
 * Uses /v2/farcaster/cast/search/
 */
async function fetchContractMentions(args: {
  contract: string;
  viewerFid?: number | null;
  afterIso?: string; // optional
  limitPerPage?: number;
  maxPages?: number;
}) {
  const { contract, viewerFid, afterIso } = args;
  const limitPerPage = Math.min(Math.max(args.limitPerPage ?? 100, 1), 100);
  const maxPages = Math.min(Math.max(args.maxPages ?? 3, 1), 10);

  // exact match query: "0x...."
  // add after:YYYY-MM-DDTHH:mm:ssZ if provided
  const q = `"${contract}"${afterIso ? ` after:${afterIso}` : ""}`;

  let cursor: string | null = null;
  const casts: any[] = [];

  for (let page = 0; page < maxPages; page++) {
    const url = new URL("https://api.neynar.com/v2/farcaster/cast/search/");
    url.searchParams.set("q", q);
    url.searchParams.set("mode", "literal");
    url.searchParams.set("sort_type", "desc_chron");
    url.searchParams.set("limit", String(limitPerPage));
    if (cursor) url.searchParams.set("cursor", cursor);
    if (viewerFid && Number.isFinite(viewerFid)) url.searchParams.set("viewer_fid", String(viewerFid));

    const res = await fetchJson(url.toString());
    if (!res.ok) {
      return { ok: false as const, status: res.status, body: res.body, casts: [] as any[] };
    }

    const pageCasts = res.json?.result?.casts;
    if (Array.isArray(pageCasts)) casts.push(...pageCasts);

    const nextCursor = res.json?.result?.next?.cursor ?? null;
    if (!nextCursor) break;
    cursor = nextCursor;

    // если страница пустая — выходим
    if (!pageCasts?.length) break;
  }

  return { ok: true as const, casts };
}

function computeTokenSocialAnalytics(contractCasts: any[]) {
  const now = Date.now();
  const h24 = 24 * 60 * 60 * 1000;
  const d7 = 7 * 24 * 60 * 60 * 1000;

  const casts24h = contractCasts.filter((c) => {
    const t = Date.parse(c?.timestamp ?? "");
    return Number.isFinite(t) && now - t <= h24;
  });

  const casts7d = contractCasts.filter((c) => {
    const t = Date.parse(c?.timestamp ?? "");
    return Number.isFinite(t) && now - t <= d7;
  });

  const mentions_24h = casts24h.length;
  const mentions_7d = casts7d.length;

  const authors24h = new Set<number>();
  const authorScores24h: number[] = [];
  let engagement24h = 0;

  for (const c of casts24h) {
    const fid = c?.author?.fid;
    if (typeof fid === "number" && Number.isFinite(fid)) authors24h.add(fid);

    const s = c?.author?.score;
    if (typeof s === "number" && Number.isFinite(s)) authorScores24h.push(s);

    engagement24h += sumEngagement(c);
  }

  const unique_authors_24h = authors24h.size;
  const median_author_score_24h = median(authorScores24h);
  const engagement_per_mention_24h = mentions_24h > 0 ? engagement24h / mentions_24h : 0;

  // velocity: сравниваем mentions_24h с "средним днём" за 7 дней
  const avg_daily_7d = mentions_7d / 7;
  const velocity_ratio = Math.log1p(mentions_24h) / Math.log1p(avg_daily_7d + 1);

  // heuristics badge
  let badge: "hot" | "shilled" | "quiet" | "normal" = "normal";
  if (mentions_24h < 2) badge = "quiet";
  if (mentions_24h >= 10 && unique_authors_24h >= 7 && (median_author_score_24h ?? 0) >= 0.6) badge = "hot";
  if (mentions_24h >= 10 && unique_authors_24h <= 3) badge = "shilled";

  // Social score 0..1 (простая, но рабочая)
  // - mentions (лог)
  // - уникальность авторов
  // - качество авторов (median score)
  // - engagement per mention (лог)
  const mentionsNorm = clamp01(Math.log1p(mentions_24h) / Math.log1p(50)); // 50 упоминаний/сутки ~ 1.0
  const authorsNorm = clamp01(unique_authors_24h / 20); // 20 уникальных ~ 1.0
  const authorQuality = clamp01(median_author_score_24h ?? 0);
  const engNorm = clamp01(Math.log1p(engagement_per_mention_24h) / Math.log1p(25)); // 25 реакций/каст ~ 1.0

  const social_score =
    0.35 * mentionsNorm +
    0.25 * authorsNorm +
    0.25 * authorQuality +
    0.15 * engNorm;

  return {
    mentions_24h,
    mentions_7d,
    unique_authors_24h,
    median_author_score_24h,
    engagement_24h: engagement24h,
    engagement_per_mention_24h,
    velocity_ratio,
    badge,
    social_score: clamp01(social_score),
  };
}

export async function GET(req: NextRequest) {
  try {
    if (!NEYNAR_API_KEY) {
      return NextResponse.json({ error: "Missing NEYNAR_API_KEY" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);

    // old params (user score)
    const fidParam = searchParams.get("fid");
    const usernameParam = searchParams.get("username");

    // new params (token social analytics)
    const contractParam = searchParams.get("contract"); // 0x...
    const viewerFidParam = searchParams.get("viewer_fid");
    const afterDaysParam = searchParams.get("after_days"); // default 7

    const viewer_fid =
      viewerFidParam && Number.isFinite(Number(viewerFidParam)) ? Number(viewerFidParam) : null;

    const after_days =
      afterDaysParam && Number.isFinite(Number(afterDaysParam)) ? Math.max(1, Math.min(30, Number(afterDaysParam))) : 7;

    // -----------------------
    // 1) Neynar user score (as before)
    // -----------------------
    let user_payload: any = null;

    if (fidParam || usernameParam) {
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

      const user = pickNeynarUser(result.json);

      const resolvedFid =
        (typeof user?.fid === "number" && Number.isFinite(user.fid) ? user.fid : null) ??
        (fid && Number.isFinite(fid) ? fid : null);

      const resolvedUsername = user?.username ?? username ?? null;

      const follower_count =
        (typeof user?.follower_count === "number" && Number.isFinite(user.follower_count) ? user.follower_count : null) ??
        (typeof user?.followers === "number" && Number.isFinite(user.followers) ? user.followers : null) ??
        null;

      user_payload = {
        fid: resolvedFid,
        username: resolvedUsername,
        neynar_score: pickNeynarScore(user),
        follower_count,
      };
    }

    // -----------------------
    // 2) Token social analytics by contract (new)
    // -----------------------
    let token_social: any = null;

    if (contractParam) {
      const contract = contractParam.trim();
      if (!isValidEthAddress(contract)) {
        return NextResponse.json({ error: "Invalid contract address. Expected 0x + 40 hex chars." }, { status: 400 });
      }

      const afterIso = toIsoNoMs(new Date(Date.now() - after_days * 24 * 60 * 60 * 1000));

      const mentionsRes = await fetchContractMentions({
        contract,
        viewerFid: viewer_fid ?? undefined,
        afterIso,
        limitPerPage: 100,
        maxPages: 3, // 300 результатов максимум (можно поднять)
      });

      if (!mentionsRes.ok) {
        console.error("Neynar cast/search error", mentionsRes.status, mentionsRes.body);
        return NextResponse.json(
          { error: "Failed Neynar cast/search", status: mentionsRes.status },
          { status: 500 }
        );
      }

      const analytics = computeTokenSocialAnalytics(mentionsRes.casts);

      // Hatchr score: пока считаем как social_score (0..1) -> 0..100
      // Дальше легко расширишь, добавив ончейн-факторы.
      const hatchr_social_score_0_100 = Math.round(analytics.social_score * 100);

      token_social = {
        contract,
        window_days: after_days,
        counts: {
          total_results_fetched: mentionsRes.casts.length,
          mentions_24h: analytics.mentions_24h,
          mentions_7d: analytics.mentions_7d,
          unique_authors_24h: analytics.unique_authors_24h,
        },
        quality: {
          median_author_score_24h: analytics.median_author_score_24h,
          engagement_24h: analytics.engagement_24h,
          engagement_per_mention_24h: analytics.engagement_per_mention_24h,
          velocity_ratio: analytics.velocity_ratio,
        },
        badge: analytics.badge,
        social_score_0_1: analytics.social_score,
        hatchr_social_score_0_100,
      };
    }

    if (!user_payload && !token_social) {
      return NextResponse.json(
        { error: "Missing parameters. Provide (fid or username) and/or contract." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      user: user_payload,          // как раньше (если запрошено)
      token_social: token_social,  // новое (если передан contract)
    });
  } catch (e) {
    console.error("token-score route error", e);
    return NextResponse.json({ error: "Internal error in token-score" }, { status: 500 });
  }
}
