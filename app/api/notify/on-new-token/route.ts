// app/api/notify/on-new-token/route.ts
import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getBaseUrl(req: Request) {
  const host = req.headers.get("host");
  return `https://${host}`;
}

function clamp(n: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, n));
}

function toNum(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * ✅ Ingest auth (simple shared secret)
 * Vercel Env: INGEST_SECRET = <random string>
 * Client must send either:
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
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`send failed: ${res.status} ${txt}`);
  }

  return res.json().catch(() => ({}));
}

export async function POST(req: Request) {
  const baseUrl = getBaseUrl(req);

  // ✅ 0) auth gate
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

    // --- payload fallback (если токена еще нет в БД или поля не заполнены) ---
    const payloadSymbol = body?.symbol ? String(body.symbol).toUpperCase() : null;
    const payloadFid = toNum(body?.farcaster_fid);
    const payloadVol = toNum(body?.volume_24h_usd);

    // 1) try fetch token from DB (но НЕ делаем это обязательным)
    let dbToken: any | null = null;
    try {
      const tokenRes = await sql`
        select token_address, symbol, first_seen_at, farcaster_fid, farcaster_url, volume_24h_usd
        from tokens
        where token_address = ${token_address}
        limit 1
      `;
      dbToken = tokenRes.rows?.[0] ?? null;
    } catch (e: any) {
      console.error("[on-new-token] DB read tokens failed:", e?.message ?? String(e));
    }

    const symbol =
      (dbToken?.symbol ? String(dbToken.symbol).toUpperCase() : null) ||
      payloadSymbol ||
      "Token";

    const fid =
      toNum(dbToken?.farcaster_fid) ??
      payloadFid ??
      null;

    // ⚠️ Важно: numeric из Postgres часто приходит string → парсим
    const vol =
      toNum(dbToken?.volume_24h_usd) ??
      payloadVol ??
      null;

    const targetUrl = `${baseUrl}/token?address=${token_address}`;

    // 2) state (если таблицы еще нет/сломалась — не валим весь запрос)
    let state = { alerted_score_90: false, alerted_vol_1000: false };
    try {
      const stRes = await sql`
        select token_address, alerted_score_90, alerted_vol_1000
        from token_alert_state
        where token_address = ${token_address}
        limit 1
      `;
      if (stRes.rows?.[0]) {
        state = {
          alerted_score_90: Boolean(stRes.rows[0].alerted_score_90),
          alerted_vol_1000: Boolean(stRes.rows[0].alerted_vol_1000),
        };
      }
    } catch (e: any) {
      console.error("[on-new-token] state read failed:", e?.message ?? String(e));
    }

    // 3) score (only if we have fid)
    let score: number | null = null;
    if (fid != null) {
      const scoreRes = await fetch(
        `${baseUrl}/api/token-score?fid=${encodeURIComponent(String(fid))}&address=${encodeURIComponent(
          token_address
        )}`,
        { cache: "no-store" }
      );

      if (scoreRes.ok) {
        const json = await scoreRes.json().catch(() => null);
        if (typeof json?.hatchr_score === "number") score = clamp(json.hatchr_score, 0, 1);
        else if (typeof json?.hatchr_score_v1 === "number") score = clamp(json.hatchr_score_v1, 0, 1);
        else if (typeof json?.creator_score === "number") score = clamp(json.creator_score, 0, 1);
      }
    }

    let sentScore = false;
    let sentVol = false;

    // ✅ DEBUG: почему не отправили
    console.log("[on-new-token] input", {
      token_address,
      symbol,
      fid,
      score,
      vol,
      state,
      hasDbToken: Boolean(dbToken),
    });

    // 4) SCORE > 0.9
    if (score != null && score > 0.9 && !state.alerted_score_90) {
      await sendPush(baseUrl, {
        notificationId: `score90:${token_address}`,
        title: "🚀 High-score token",
        body: `${symbol} hit Hatchr Score ${score.toFixed(2)}`,
        targetUrl,
      });

      try {
        await sql`
          insert into token_alert_state (token_address, alerted_score_90, alerted_vol_1000, updated_at)
          values (${token_address}, true, ${Boolean(state.alerted_vol_1000)}, now())
          on conflict (token_address) do update set
            alerted_score_90 = true,
            updated_at = now()
        `;
      } catch (e: any) {
        console.error("[on-new-token] state upsert (score) failed:", e?.message ?? String(e));
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
          values (${token_address}, ${Boolean(state.alerted_score_90)}, true, now())
          on conflict (token_address) do update set
            alerted_vol_1000 = true,
            updated_at = now()
        `;
      } catch (e: any) {
        console.error("[on-new-token] state upsert (vol) failed:", e?.message ?? String(e));
      }

      sentVol = true;
    }

    return NextResponse.json({
      ok: true,
      token_address,
      has_db_token: Boolean(dbToken),
      fid,
      score,
      vol,
      sent: { score90: sentScore, vol1000: sentVol },
    });
  } catch (e: any) {
    console.error("[on-new-token] fatal:", e?.message ?? String(e));
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
