import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// --- utils: timeout ---
function withTimeout(ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cleanup: () => clearTimeout(t) };
}

async function safeCall<T>(label: string, fn: () => Promise<T>, fallback: T) {
  try {
    const data = await fn();
    return { ok: true as const, data, error: null as string | null };
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? "timeout" : (e?.message ?? String(e));
    console.error(`[notify][${label}]`, msg);
    return { ok: false as const, data: fallback, error: msg };
  }
}

// --- IMPORTANT: base url for internal calls ---
function getBaseUrl(req: Request) {
  const host = req.headers.get("host");
  return `https://${host}`;
}

function clamp(n: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, n));
}

function extractFarcasterUsername(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (!parts.length) return null;
    return parts[parts.length - 1];
  } catch {
    return null;
  }
}

// --- Get tokens using the same providers approach as your /api/tokens ---
async function getTokensFromProviders(signal: AbortSignal) {
  const providers: any = await import("@/lib/providers");

  const hasSplit =
    typeof providers.getClankerTokens === "function" ||
    typeof providers.getZoraTokens === "function";

  if (hasSplit) {
    const clankerFn =
      typeof providers.getClankerTokens === "function"
        ? () => providers.getClankerTokens({ signal })
        : async () => [];

    const zoraFn =
      typeof providers.getZoraTokens === "function"
        ? () => providers.getZoraTokens({ signal })
        : async () => [];

    const [clanker, zora] = await Promise.all([
      safeCall("clanker", clankerFn, [] as any[]),
      safeCall("zora", zoraFn, [] as any[]),
    ]);

    return [...clanker.data, ...zora.data];
  }

  if (typeof providers.getTokens !== "function") return [];
  const aggregated = await safeCall("getTokens", () => providers.getTokens(), [] as any[]);
  return aggregated.data ?? [];
}

// --- Map token like you need for alerts ---
function mapForAlerts(t: any) {
  const token_address = String(t?.token_address ?? "").toLowerCase();
  const symbol = String(t?.symbol ?? "").toUpperCase();

  const volume_24h_usd =
    typeof t?.volume_24h_usd === "number" && Number.isFinite(t.volume_24h_usd)
      ? t.volume_24h_usd
      : null;

  const first_seen_at = typeof t?.first_seen_at === "string" ? t.first_seen_at : null;

  const farcaster_fid =
    typeof t?.farcaster_fid === "number" && Number.isFinite(t.farcaster_fid)
      ? t.farcaster_fid
      : null;

  const farcaster_url = typeof t?.farcaster_url === "string" ? t.farcaster_url : null;
  const farcaster_username = extractFarcasterUsername(farcaster_url);

  const name = typeof t?.name === "string" ? t.name : "";
  const tokenSymbol = typeof t?.symbol === "string" ? t.symbol : "";

  return {
    token_address,
    symbol,
    volume_24h_usd,
    first_seen_at,
    farcaster_fid,
    farcaster_username,
    tokenName: name,
    tokenSymbol,
  };
}

async function sendPush(
  baseUrl: string,
  payload: {
    notificationId: string;
    title: string;
    body: string;
    targetUrl: string;
  }
) {
  const res = await fetch(`${baseUrl}/api/notify/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`send failed: ${res.status} ${txt}`);
  }

  return res.json().catch(() => ({}));
}

// --- Fetch hatchr/neynar score via your existing /api/token-score ---
async function fetchTokenScore(baseUrl: string, t: any) {
  // Prefer fid, fallback to username
  const qs =
    t.farcaster_fid != null
      ? `fid=${encodeURIComponent(String(t.farcaster_fid))}`
      : t.farcaster_username
      ? `username=${encodeURIComponent(String(t.farcaster_username))}`
      : null;

  if (!qs) return null;

  const addressQs = t.token_address ? `&address=${encodeURIComponent(t.token_address)}` : "";
  const tokenCreatedAtQs = t.first_seen_at ? `&tokenCreatedAt=${encodeURIComponent(t.first_seen_at)}` : "";
  const tokenNameQs = t.tokenName ? `&tokenName=${encodeURIComponent(t.tokenName)}` : "";
  const tokenSymbolQs = t.tokenSymbol ? `&tokenSymbol=${encodeURIComponent(t.tokenSymbol)}` : "";

  const url = `${baseUrl}/api/token-score?${qs}${addressQs}${tokenCreatedAtQs}${tokenNameQs}${tokenSymbolQs}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;

  const json: any = await res.json().catch(() => null);
  if (!json) return null;

  const scoreRaw =
    typeof json?.hatchr_score === "number"
      ? json.hatchr_score
      : typeof json?.hatchr_score_v1 === "number"
      ? json.hatchr_score_v1
      : typeof json?.neynar_score === "number"
      ? json.neynar_score
      : typeof json?.creator_score === "number"
      ? json.creator_score
      : null;

  if (typeof scoreRaw === "number" && Number.isFinite(scoreRaw)) return clamp(scoreRaw, 0, 1);
  return null;
}

export async function GET(req: Request) {
  const baseUrl = getBaseUrl(req);
  const { signal, cleanup } = withTimeout(12_000);

  try {
    // 0) Read cursor (last processed time)
    const cursorRow = await sql`
      select last_seen_at
      from notify_cursor
      where id = 'tokens'
      limit 1
    `;

    const lastSeenAtMs = cursorRow.rows?.[0]?.last_seen_at
      ? Date.parse(String(cursorRow.rows[0].last_seen_at))
      : Date.now() - 15 * 60 * 1000; // fallback: last 15 min

    // 1) Fetch tokens
    const raw = await getTokensFromProviders(signal);
    const tokensAll = raw.map(mapForAlerts).filter((t) => t.token_address);

    // 2) Filter only "fresh"
    const fresh = tokensAll.filter((t) => {
      if (!t.first_seen_at) return false;
      const ts = Date.parse(t.first_seen_at);
      return Number.isFinite(ts) && ts > lastSeenAtMs;
    });

    if (!fresh.length) {
      return NextResponse.json({
        ok: true,
        checked: 0,
        fresh: 0,
        cursor: new Date(lastSeenAtMs).toISOString(),
        sent: { score90: 0, vol1000: 0 },
        note: "No fresh tokens since last cursor.",
      });
    }

    let sentScore = 0;
    let sentVol = 0;
    let scoreLookups = 0;
    let skippedScoreNoIdentity = 0;

    for (const t of fresh) {
      // 3) Dedup state
      const { rows } = await sql`
        select token_address, alerted_score_90, alerted_vol_1000
        from token_alert_state
        where token_address = ${t.token_address}
        limit 1
      `;

      const state = rows[0] ?? {
        token_address: t.token_address,
        alerted_score_90: false,
        alerted_vol_1000: false,
      };

      const targetUrl = `${baseUrl}/token?address=${t.token_address}`;

      // 4) SCORE > 0.9 (only once)
      if (!state.alerted_score_90) {
        if (t.farcaster_fid == null && !t.farcaster_username) {
          skippedScoreNoIdentity += 1;
        } else {
          scoreLookups += 1;
          const score = await fetchTokenScore(baseUrl, t);

          if (score != null && score > 0.9) {
            await sendPush(baseUrl, {
              notificationId: `score90:${t.token_address}`,
              title: "🚀 High-score token",
              body: `${t.symbol || "Token"} hit Hatchr Score ${score.toFixed(2)}`,
              targetUrl,
            });

            await sql`
              insert into token_alert_state (token_address, alerted_score_90, alerted_vol_1000, updated_at)
              values (${t.token_address}, true, ${state.alerted_vol_1000}, now())
              on conflict (token_address) do update set
                alerted_score_90 = true,
                updated_at = now()
            `;
            sentScore += 1;
          }
        }
      }

      // 5) VOLUME > 1000 (only once)
      if (t.volume_24h_usd != null && t.volume_24h_usd > 1000 && !state.alerted_vol_1000) {
        await sendPush(baseUrl, {
          notificationId: `vol1000:${t.token_address}`,
          title: "📈 Volume spike",
          body: `${t.symbol || "Token"} volume crossed $1,000`,
          targetUrl,
        });

        await sql`
          insert into token_alert_state (token_address, alerted_score_90, alerted_vol_1000, updated_at)
          values (${t.token_address}, ${state.alerted_score_90}, true, now())
          on conflict (token_address) do update set
            alerted_vol_1000 = true,
            updated_at = now()
        `;
        sentVol += 1;
      }
    }

    // 6) Update cursor to newest fresh token time
    const maxTs = Math.max(
      ...fresh
        .map((t) => (t.first_seen_at ? Date.parse(t.first_seen_at) : NaN))
        .filter((n) => Number.isFinite(n))
    );

    if (Number.isFinite(maxTs)) {
      await sql`
        insert into notify_cursor (id, last_seen_at)
        values ('tokens', ${new Date(maxTs).toISOString()})
        on conflict (id) do update set last_seen_at = excluded.last_seen_at
      `;
    }

    return NextResponse.json({
      ok: true,
      checked: tokensAll.length,
      fresh: fresh.length,
      cursor: new Date(maxTs).toISOString(),
      sent: { score90: sentScore, vol1000: sentVol },
      debug: {
        scoreLookups,
        skippedScoreNoIdentity,
        lastSeenAt: new Date(lastSeenAtMs).toISOString(),
      },
      note:
        skippedScoreNoIdentity > 0
          ? `Skipped score check for ${skippedScoreNoIdentity} fresh tokens because no farcaster_fid/username found.`
          : null,
    });
  } finally {
    cleanup();
  }
}
