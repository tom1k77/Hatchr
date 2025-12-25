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
  // Vercel всегда https на проде
  return `https://${host}`;
}

// --- This tries to read Hatchr score from token if present.
// If you don't have it in /api/tokens yet, it will be null and score alerts will be skipped.
function pickHatchrScore(t: any): number | null {
  const candidates = [
    t?.hatchr_score,
    t?.hatchrScore,
    t?.token_score,
    t?.tokenScore,
    t?.score, // иногда кто-то так называет
  ];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
    if (typeof c === "string") {
      const n = Number(c);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
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

  const hatchr_score = pickHatchrScore(t);

  return { token_address, symbol, volume_24h_usd, hatchr_score };
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

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`send failed: ${res.status} ${txt}`);
  }

  return res.json().catch(() => ({}));
}

export async function GET(req: Request) {
  const baseUrl = getBaseUrl(req);

  const { signal, cleanup } = withTimeout(12_000);
  try {
    const raw = await getTokensFromProviders(signal);
    const tokens = raw.map(mapForAlerts).filter(t => t.token_address);

    let sentScore = 0;
    let sentVol = 0;
    let skippedScoreBecauseNoField = 0;

    for (const t of tokens) {
      // 1) Получаем текущий дедуп-статус из БД
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

      // 2) SCORE > 0.9 (если у тебя hatchr_score реально есть в данных)
      if (t.hatchr_score == null) {
        skippedScoreBecauseNoField += 1;
      } else if (t.hatchr_score > 0.9 && !state.alerted_score_90) {
        // targetUrl должен быть на том же домене — у тебя это /token?address=...
        const targetUrl = `${baseUrl}/token?address=${t.token_address}`;

        await sendPush(baseUrl, {
          notificationId: `score90:${t.token_address}`,
          title: "🚀 High-score token",
          body: `${t.symbol || "Token"} hit Hatchr Score ${t.hatchr_score.toFixed(2)}`,
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

      // 3) VOLUME > 1000
      if (t.volume_24h_usd != null && t.volume_24h_usd > 1000 && !state.alerted_vol_1000) {
        const targetUrl = `${baseUrl}/token?address=${t.token_address}`;

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

    return NextResponse.json({
      ok: true,
      checked: tokens.length,
      sent: { score90: sentScore, vol1000: sentVol },
      note: skippedScoreBecauseNoField
        ? `Score alerts skipped for ${skippedScoreBecauseNoField} tokens because hatchr_score is missing in token items. Add hatchr_score to /api/tokens items or plug your score fetch here.`
        : null,
    });
  } finally {
    cleanup();
  }
}
