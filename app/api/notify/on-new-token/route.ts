// app/api/notify/on-new-token/route.ts
import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type TokenRow = {
  token_address: string;
  symbol: string | null;
  first_seen_at: string | null;
  farcaster_fid: number | null;
  farcaster_url: string | null;
  volume_24h_usd: number | null;
};

type StateRow = {
  token_address: string;
  alerted_score_90: boolean | null;
  alerted_vol_1000: boolean | null;
};

function getBaseUrl(req: Request) {
  const host = req.headers.get("host");
  return `https://${host}`;
}

function clamp(n: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, n));
}

/**
 * ✅ Ingest auth (simple shared secret)
 * ENV: INGEST_SECRET = <random string>
 * Client must send:
 * - x-ingest-secret: <secret>
 * OR
 * - Authorization: Bearer <secret>
 */
function verifyIngestSecret(req: Request): { ok: true } | { ok: false; reason: string } {
  const secret = (process.env.INGEST_SECRET || "").trim();
  if (!secret) return { ok: false, reason: "INGEST_SECRET is not set in environment variables" };

  const headerSecret = (req.headers.get("x-ingest-secret") || "").trim();

  const auth = (req.headers.get("authorization") || "").trim();
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";

  const provided = headerSecret || bearer;

  if (!provided) return { ok: false, reason: "Missing ingest secret header" };
  if (provided !== secret) return { ok: false, reason: "Invalid ingest secret" };

  return { ok: true };
}

async function sendPush(
  baseUrl: string,
  payload: { notificationId: string; title: string; body: string; targetUrl: string }
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

function toNum(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  const baseUrl = getBaseUrl(req);

  // ✅ auth gate
  const auth = verifyIngestSecret(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const token_address = String(body?.token_address ?? "").trim().toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(token_address)) {
      return NextResponse.json({ ok: false, error: "Invalid token_address" }, { status: 400 });
    }

    // Fallback fields from body (so we don't depend on DB being "ready")
    const bodySymbol = body?.symbol ? String(body.symbol).trim() : "";
    const bodyFid = typeof body?.farcaster_fid === "number" ? body.farcaster_fid : toNum(body?.farcaster_fid);
    const bodyVol = toNum(body?.volume_24h_usd);

    // defaults
    let token: TokenRow | null = null;
    let state = { alerted_score_90: false, alerted_vol_1000: false };

    // 1) fetch token from DB (optional)
    try {
      const tokenRes = await sql<TokenRow>`
        select token_address, symbol, first_seen_at, farcaster_fid, farcaster_url, volume_24h_usd
        from tokens
        where token_address = ${token_address}
        limit 1
      `;
      token = tokenRes.rows?.[0] ?? null;
    } catch (e: any) {
      console.error("[on-new-token] db token read failed:", e?.message ?? String(e));
      token = null;
    }

    // 2) state (optional)
    try {
      const stRes = await sql<StateRow>`
        select token_address, alerted_score_90, alerted_vol_1000
        from token_alert_state
        where token_address = ${token_address}
        limit 1
      `;
      const row = stRes.rows?.[0];
      if (row) {
        state = {
          alerted_score_90: Boolean(row.alerted_score_90),
          alerted_vol_1000: Boolean(row.alerted_vol_1000),
        };
      }
    } catch (e: any) {
      console.error("[on-new-token] state read failed:", e?.message ?? String(e));
    }

    const symbol = (token?.symbol ? String(token.symbol) : bodySymbol || "Token").toUpperCase();
    const targetUrl = `${baseUrl}/token?address=${token_address}`;

    // ✅ Use fid from DB OR body
    const fid = (typeof token?.farcaster_fid === "number" ? token.farcaster_fid : null) ?? (typeof bodyFid === "number" ? bodyFid : null);

    // ✅ Use volume from DB OR body
    const vol = (typeof token?.volume_24h_usd === "number" ? token.volume_24h_usd : null) ?? bodyVol;

    console.log("[on-new-token] addr=", token_address, "fid=", fid, "vol=", vol, "sym=", symbol);

    let score: number | null = null;

    // 3) compute score if we have fid
    if (fid) {
      const scoreRes = await fetch(
        `${baseUrl}/api/token-score?fid=${encodeURIComponent(String(fid))}&address=${encodeURIComponent(token_address)}`,
        { cache: "no-store" }
      );

      if (scoreRes.ok) {
        const json = await scoreRes.json().catch(() => null);

        if (typeof json?.hatchr_score === "number") score = clamp(json.hatchr_score, 0, 1);
        else if (typeof json?.hatchr_score_v1 === "number") score = clamp(json.hatchr_score_v1, 0, 1);
        else if (typeof json?.creator_score === "number") score = clamp(json.creator_score, 0, 1);
      } else {
        const txt = await scoreRes.text().catch(() => "");
        console.error("[on-new-token] token-score failed:", scoreRes.status, txt.slice(0, 200));
      }
    }

    let sentScore = false;
    let sentVol = false;

    // 4) SCORE > 0.9
    if (score != null && score > 0.9 && !state.alerted_score_90) {
      await sendPush(baseUrl, {
        notificationId: `score90:${token_address}`,
        title: "🚀 High-score creator",
        body: `${symbol} creator score ${score.toFixed(2)}`,
        targetUrl,
      });

      try {
        await sql`
          insert into token_alert_state (token_address, alerted_score_90, alerted_vol_1000, updated_at)
          values (${token_address}, true, ${state.alerted_vol_1000}, now())
          on conflict (token_address) do update set
            alerted_score_90 = true,
            updated_at = now()
        `;
      } catch (e: any) {
        console.error("[on-new-token] state write score failed:", e?.message ?? String(e));
      }

      sentScore = true;
    }

    // 5) VOLUME > 1000
    if (vol != null && vol > 1000 && !state.alerted_vol_1000) {
      await sendPush(baseUrl, {
        notificationId: `vol1000:${token_address}`,
        title: "📈 Volume spike",
        body: `${symbol} volume crossed $1,000`,
        targetUrl,
      });

      try {
        await sql`
          insert into token_alert_state (token_address, alerted_score_90, alerted_vol_1000, updated_at)
          values (${token_address}, ${state.alerted_score_90}, true, now())
          on conflict (token_address) do update set
            alerted_vol_1000 = true,
            updated_at = now()
        `;
      } catch (e: any) {
        console.error("[on-new-token] state write vol failed:", e?.message ?? String(e));
      }

      sentVol = true;
    }

    return NextResponse.json({
      ok: true,
      token_address,
      fid: fid ?? null,
      score,
      vol,
      sent: { score90: sentScore, vol1000: sentVol },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
