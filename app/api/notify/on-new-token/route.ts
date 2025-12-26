import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres"; // если уже используешь, иначе neon
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getBaseUrl(req: Request) {
  const host = req.headers.get("host");
  return `https://${host}`;
}

async function sendPush(baseUrl: string, payload: {
  notificationId: string;
  title: string;
  body: string;
  targetUrl: string;
}) {
  const res = await fetch(`${baseUrl}/api/notify/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`send failed: ${res.status}`);
  return res.json().catch(() => ({}));
}

function clamp(n: number, min=0, max=1) {
  return Math.max(min, Math.min(max, n));
}

export async function POST(req: Request) {
  const baseUrl = getBaseUrl(req);

  try {
    const body = await req.json().catch(() => ({}));
    const token_address = String(body?.token_address ?? "").trim().toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(token_address)) {
      return NextResponse.json({ ok: false, error: "Invalid token_address" }, { status: 400 });
    }

    // 1) достаем токен из БД (или можно передавать все поля в body)
    const tokenRes = await sql`
      select token_address, symbol, first_seen_at, farcaster_fid, farcaster_url, volume_24h_usd
      from tokens
      where token_address = ${token_address}
      limit 1
    `;
    const token = tokenRes.rows?.[0];
    if (!token) {
      return NextResponse.json({ ok: false, error: "Token not found in DB yet" }, { status: 404 });
    }

    // 2) state
    const stRes = await sql`
      select token_address, alerted_score_90, alerted_vol_1000
      from token_alert_state
      where token_address = ${token_address}
      limit 1
    `;
    const state = stRes.rows?.[0] ?? { alerted_score_90: false, alerted_vol_1000: false };

    const symbol = (token.symbol ? String(token.symbol).toUpperCase() : "Token");
    const targetUrl = `${baseUrl}/token?address=${token_address}`;

    let score: number | null = null;

    // 3) score only if we have identity
    const fid = typeof token.farcaster_fid === "number" ? token.farcaster_fid : null;
    // если у тебя farcaster_url хранится и можно вытащить username — можно добавить
    if (fid) {
      const scoreRes = await fetch(`${baseUrl}/api/token-score?fid=${encodeURIComponent(String(fid))}&address=${encodeURIComponent(token_address)}`, {
        cache: "no-store",
      });
      if (scoreRes.ok) {
        const json = await scoreRes.json();
        if (typeof json?.hatchr_score === "number") score = clamp(json.hatchr_score, 0, 1);
        else if (typeof json?.hatchr_score_v1 === "number") score = clamp(json.hatchr_score_v1, 0, 1);
        else if (typeof json?.creator_score === "number") score = clamp(json.creator_score, 0, 1);
      }
    }

    let sentScore = false;
    let sentVol = false;

    // 4) SCORE > 0.9
    if (score != null && score > 0.9 && !state.alerted_score_90) {
      await sendPush(baseUrl, {
        notificationId: `score90:${token_address}`,
        title: "🚀 High-score token",
        body: `${symbol} hit Hatchr Score ${score.toFixed(2)}`,
        targetUrl,
      });

      await sql`
        insert into token_alert_state (token_address, alerted_score_90, alerted_vol_1000, updated_at)
        values (${token_address}, true, ${Boolean(state.alerted_vol_1000)}, now())
        on conflict (token_address) do update set
          alerted_score_90 = true,
          updated_at = now()
      `;
      sentScore = true;
    }

    // 5) VOLUME > 1000
    const vol = typeof token.volume_24h_usd === "number" ? token.volume_24h_usd : null;
    if (vol != null && vol > 1000 && !state.alerted_vol_1000) {
      await sendPush(baseUrl, {
        notificationId: `vol1000:${token_address}`,
        title: "📈 Volume spike",
        body: `${symbol} volume crossed $1,000`,
        targetUrl,
      });

      await sql`
        insert into token_alert_state (token_address, alerted_score_90, alerted_vol_1000, updated_at)
        values (${token_address}, ${Boolean(state.alerted_score_90)}, true, now())
        on conflict (token_address) do update set
          alerted_vol_1000 = true,
          updated_at = now()
      `;
      sentVol = true;
    }

    return NextResponse.json({
      ok: true,
      token_address,
      fid: fid ?? null,
      score,
      sent: { score90: sentScore, vol1000: sentVol },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
