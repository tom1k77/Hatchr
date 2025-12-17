// app/api/token-score/route.ts
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

// ✅ BaseScan
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY;
const BASESCAN_API = "https://api.basescan.org/api";

// ✅ Clanker
const CLANKER_SEARCH_CREATOR = "https://clanker.world/api/search-creator";

// ---- utils ----
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

function pickPowerBadge(obj: any): boolean | null {
  const pb =
    obj?.power_badge ??
    obj?.powerBadge ??
    obj?.badges?.power_badge ??
    obj?.badges?.powerBadge;
  return typeof pb === "boolean" ? pb : null;
}

function safeDateString(x: any): string | null {
  if (typeof x !== "string" || !x) return null;
  const t = Date.parse(x);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function normEthAddress(a: any): string | null {
  if (typeof a !== "string") return null;
  const s = a.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(s)) return null;
  return s.toLowerCase();
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

// ---- followers quality ----
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

    const pb = pickPowerBadge(u);
    if (pb === true) powerBadgeCount += 1;
  }

  const avg = scoredCount > 0 ? scoreSum / scoredCount : null;
  const pbRatio = sampled > 0 ? powerBadgeCount / sampled : null;

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

// ✅ Mentions: отдаём openUrl в формате warpcast.com/~/cast/<hash>
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
    const warpcastUrl = hash ? `https://warpcast.com/~/cast/${hash}` : null;

    return {
      hash,
      warpcastUrl,
      openUrl: warpcastUrl,
      timestamp: c?.timestamp ?? c?.created_at ?? null,
      text: c?.text ?? "",
      author: {
        fid: c?.author?.fid ?? null,
        username: typeof c?.author?.username === "string" ? c.author.username : null,
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

// ✅ Creator context: + needles_used + earliest_match_cast (hash/text/timestamp/openUrl)
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

  const needles_used = [tokenName?.trim(), tokenSymbol?.trim(), address?.trim()?.toLowerCase()]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());

  if (!resp.ok) {
    return {
      classification: "unknown",
      checked: 0,
      matches: 0,
      earliest_match_ts: null,
      needles_used,
      earliest_match_cast: null,
    };
  }

  const json: any = await resp.json();
  const casts: any[] =
    Array.isArray(json?.casts) ? json.casts : Array.isArray(json?.result?.casts) ? json.result.casts : [];

  const createdMs = tokenCreatedAt ? Date.parse(tokenCreatedAt) : NaN;

  let matches = 0;
  let earliestBefore: { ts: string; cast: any } | null = null;

  for (const c of casts) {
    const text = String(c?.text ?? "").toLowerCase();
    if (!text) continue;

    const hit = needles_used.some((n) => n && text.includes(n));
    if (!hit) continue;

    matches += 1;

    const ts = c?.timestamp ?? c?.created_at ?? null;
    if (!ts) continue;

    if (Number.isFinite(createdMs)) {
      const t = Date.parse(ts);
      if (Number.isFinite(t) && t < createdMs) {
        if (!earliestBefore || Date.parse(ts) < Date.parse(earliestBefore.ts)) {
          earliestBefore = { ts, cast: c };
        }
      }
    }
  }

  const classification =
    earliestBefore
      ? "ongoing_build_or_preannounced"
      : matches > 0
        ? "mentioned_but_no_timestamp_context"
        : "fresh_launch_or_unknown";

  const earliest_match_ts = earliestBefore?.ts ?? null;

  const earliestHash: string | null =
    typeof earliestBefore?.cast?.hash === "string" ? earliestBefore.cast.hash : null;

  const earliest_match_cast = earliestBefore
    ? {
        hash: earliestHash,
        timestamp: earliest_match_ts,
        text: String(earliestBefore.cast?.text ?? "").slice(0, 240),
        openUrl: earliestHash ? `https://warpcast.com/~/cast/${earliestHash}` : null,
      }
    : null;

  return {
    classification,
    checked: casts.length,
    matches,
    earliest_match_ts,
    needles_used,
    earliest_match_cast,
  };
}

// =============================
// ✅ BaseScan: deploy count cache (wallet contract creations)
// =============================
type DeployCountResult = {
  count: number | null;
  method:
    | "basescan_contract_creations"
    | "basescan_unavailable"
    | "basescan_rate_limited"
    | "basescan_error";
  addresses_used: string[];
  scanned_txs: number;
  note?: string;
};

const DEPLOY_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function getDeployCache(): Map<string, { ts: number; v: DeployCountResult }> {
  const g = globalThis as any;
  if (!g.__hatchr_deploy_cache) g.__hatchr_deploy_cache = new Map();
  return g.__hatchr_deploy_cache;
}

async function fetchBaseScanContractCreations(address: string): Promise<{ count: number; scanned: number } | null> {
  if (!BASESCAN_API_KEY) return null;

  const MAX_PAGES = 3;
  const OFFSET = 100;

  let page = 1;
  let scanned = 0;
  let created = 0;

  while (page <= MAX_PAGES) {
    const url =
      `${BASESCAN_API}?module=account&action=txlist` +
      `&address=${encodeURIComponent(address)}` +
      `&page=${page}&offset=${OFFSET}&sort=desc` +
      `&apikey=${encodeURIComponent(BASESCAN_API_KEY)}`;

    const resp = await fetch(url, { cache: "no-store" });

    if (resp.status === 429) return null;
    if (!resp.ok) return null;

    const json: any = await resp.json();
    const rows: any[] = Array.isArray(json?.result) ? json.result : [];
    if (!rows.length) break;

    scanned += rows.length;

    for (const tx of rows) {
      const to = typeof tx?.to === "string" ? tx.to : "";
      const ca = typeof tx?.contractAddress === "string" ? tx.contractAddress : "";
      if ((!to || to === "0x0000000000000000000000000000000000000000") && ca && ca.startsWith("0x")) {
        created += 1;
      }
    }

    if (rows.length < OFFSET) break;
    page += 1;
  }

  return { count: created, scanned };
}

async function fetchCreatorDeployCountFromVerifiedWallets(user: any): Promise<DeployCountResult> {
  if (!BASESCAN_API_KEY) {
    return {
      count: null,
      method: "basescan_unavailable",
      addresses_used: [],
      scanned_txs: 0,
      note: "Missing BASESCAN_API_KEY",
    };
  }

  const cache = getDeployCache();

  const ethAddrsRaw: any[] = Array.isArray(user?.verified_addresses?.eth_addresses)
    ? user.verified_addresses.eth_addresses
    : [];

  const ethAddrs = ethAddrsRaw.map(normEthAddress).filter(Boolean) as string[];
  const addresses_used = ethAddrs.slice(0, 2);

  if (!addresses_used.length) {
    return {
      count: 0,
      method: "basescan_contract_creations",
      addresses_used: [],
      scanned_txs: 0,
      note: "No verified eth_addresses",
    };
  }

  const key = `deploycount:${addresses_used.join(",")}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < DEPLOY_TTL_MS) return cached.v;

  let total = 0;
  let scanned_txs = 0;

  for (const a of addresses_used) {
    const one = await fetchBaseScanContractCreations(a);
    if (!one) {
      const v: DeployCountResult = {
        count: null,
        method: "basescan_rate_limited",
        addresses_used,
        scanned_txs,
        note: "Rate limited or unavailable response",
      };
      cache.set(key, { ts: Date.now(), v });
      return v;
    }

    total += one.count;
    scanned_txs += one.scanned;
  }

  const v: DeployCountResult = {
    count: total,
    method: "basescan_contract_creations",
    addresses_used,
    scanned_txs,
    note: "Counts contract creations in last ~300 tx per address (desc)",
  };

  cache.set(key, { ts: Date.now(), v });
  return v;
}

// =============================
// ✅ Clanker: creator tokens (official endpoint from docs)
// =============================
type ClankerCreatorToken = {
  contract_address: string | null;
  name: string | null;
  symbol: string | null;
  img_url: string | null;
  deployed_at: string | null;
  msg_sender: string | null;
  trust_level: "allowlisted" | "trusted_deployer" | "fid_verified" | "unverified" | "unknown";
  trustStatus?: any;
  clanker_url: string | null;
};

type ClankerCreatorResult = {
  q: string;
  total: number | null;
  hasMore: boolean | null;
  searchedAddress: string | null;
  user?: any;
  tokens: ClankerCreatorToken[];
  trust_counts: {
    allowlisted: number;
    trusted_deployer: number;
    fid_verified: number;
    unverified: number;
    unknown: number;
  };
};

function clankerTrustLevel(ts: any): ClankerCreatorToken["trust_level"] {
  if (!ts || typeof ts !== "object") return "unknown";
  if (ts?.isTrustedClanker === true) return "allowlisted";
  if (ts?.isTrustedDeployer === true) return "trusted_deployer";
  if (ts?.fidMatchesDeployer === true) return "fid_verified";
  return "unverified";
}

function getClankerCache(): Map<string, { ts: number; v: ClankerCreatorResult }> {
  const g = globalThis as any;
  if (!g.__hatchr_clanker_creator_cache) g.__hatchr_clanker_creator_cache = new Map();
  return g.__hatchr_clanker_creator_cache;
}

const CLANKER_TTL_MS = 10 * 60 * 1000; // 10 min

async function fetchClankerByCreator(q: string, limit = 20): Promise<ClankerCreatorResult | null> {
  const qq = (q || "").trim();
  if (!qq) return null;

  const cache = getClankerCache();
  const key = `clanker:${qq.toLowerCase()}:${limit}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CLANKER_TTL_MS) return cached.v;

  const url = new URL(CLANKER_SEARCH_CREATOR);
  url.searchParams.set("q", qq);
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 50)));
  url.searchParams.set("offset", "0");
  url.searchParams.set("sort", "desc");
  url.searchParams.set("trustedOnly", "false");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("[Clanker search-creator] error", res.status, t.slice(0, 200));
    return {
      q: qq,
      total: null,
      hasMore: null,
      searchedAddress: null,
      tokens: [],
      trust_counts: { allowlisted: 0, trusted_deployer: 0, fid_verified: 0, unverified: 0, unknown: 0 },
    };
  }

  const json: any = await res.json().catch(() => null);
  if (!json) return null;

  const rawTokens: any[] = Array.isArray(json?.tokens) ? json.tokens : [];

  const trust_counts = { allowlisted: 0, trusted_deployer: 0, fid_verified: 0, unverified: 0, unknown: 0 };

  const tokens: ClankerCreatorToken[] = rawTokens.slice(0, 20).map((t: any) => {
    const addr = typeof t?.contract_address === "string" ? t.contract_address.toLowerCase() : null;
    const ts = t?.trustStatus;
    const trust_level = clankerTrustLevel(ts);

    if (trust_level === "allowlisted") trust_counts.allowlisted += 1;
    else if (trust_level === "trusted_deployer") trust_counts.trusted_deployer += 1;
    else if (trust_level === "fid_verified") trust_counts.fid_verified += 1;
    else if (trust_level === "unverified") trust_counts.unverified += 1;
    else trust_counts.unknown += 1;

    return {
      contract_address: addr,
      name: typeof t?.name === "string" ? t.name : null,
      symbol: typeof t?.symbol === "string" ? t.symbol : null,
      img_url: typeof t?.img_url === "string" ? t.img_url : null,
      deployed_at: typeof t?.deployed_at === "string" ? t.deployed_at : (typeof t?.created_at === "string" ? t.created_at : null),
      msg_sender: typeof t?.msg_sender === "string" ? t.msg_sender : null,
      trust_level,
      trustStatus: ts,
      // если у clanker другой url-формат — можно поменять позже
      clanker_url: addr ? `https://clanker.world/token/${addr}` : null,
    };
  });

  const out: ClankerCreatorResult = {
    q: qq,
    total: typeof json?.total === "number" && Number.isFinite(json.total) ? json.total : (rawTokens.length || 0),
    hasMore: typeof json?.hasMore === "boolean" ? json.hasMore : null,
    searchedAddress: typeof json?.searchedAddress === "string" ? json.searchedAddress : null,
    user: json?.user,
    tokens,
    trust_counts,
  };

  cache.set(key, { ts: Date.now(), v: out });
  return out;
}

// =============================
// GET
// =============================
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

    const creator_power_badge = pickPowerBadge(user);

    const creator_created_at =
      safeDateString(user?.created_at) ??
      safeDateString(user?.profile?.created_at) ??
      safeDateString(user?.user?.created_at) ??
      null;

    const followersQuality =
      resolvedFid && Number.isFinite(resolvedFid)
        ? await fetchFollowersQuality(resolvedFid, 150)
        : EMPTY_FQ;

    const followers_quality = followersQuality.followers_quality;

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

    // ✅ BaseScan wallet deploys (optional signal)
    const creator_tokens_deployed_basescan =
      user ? await fetchCreatorDeployCountFromVerifiedWallets(user) : null;

    // ✅ Clanker official “Get Tokens by Creator”
    // Prefer username, fallback to first verified eth address
    const verifiedEths: string[] = Array.isArray(user?.verified_addresses?.eth_addresses)
      ? user.verified_addresses.eth_addresses.map(normEthAddress).filter(Boolean)
      : [];

    const clankerQ =
      (typeof resolvedUsername === "string" && resolvedUsername.trim() ? resolvedUsername.trim() : null) ??
      (verifiedEths[0] ?? null);

    const clanker_creator = clankerQ ? await fetchClankerByCreator(clankerQ, 20) : null;

    // ✅ Unified for UI: use clanker total as primary
    const creator_tokens_deployed = {
      clanker_total: typeof clanker_creator?.total === "number" ? clanker_creator.total : null,
      clanker_q: clanker_creator?.q ?? null,
      clanker_has_more: clanker_creator?.hasMore ?? null,
      clanker_trust_counts: clanker_creator?.trust_counts ?? null,
      clanker_recent_tokens: clanker_creator?.tokens ?? [],
      basescan_wallet_contract_creations: creator_tokens_deployed_basescan ?? null,
    };

    return NextResponse.json({
      fid: resolvedFid,
      username: resolvedUsername,

      // BACK-COMPAT
      neynar_score: creator_score,
      hatchr_score_v1: hatchr_score,

      // SCORES
      creator_score,
      followers_quality,
      hatchr_score,
      follower_count,

      // small creator summary for UI
      creator_summary: {
        power_badge: creator_power_badge,
        created_at: creator_created_at,
        verified_eth_addresses: Array.isArray(user?.verified_addresses?.eth_addresses)
          ? user.verified_addresses.eth_addresses
          : [],
      },

      // ✅ NEW (Clanker + BaseScan)
      creator_tokens_deployed,

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
