import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// простая защита
function assertAuth(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.CRON_TOKEN || token !== process.env.CRON_TOKEN) {
    throw new Error("Unauthorized");
  }
}

async function getNewTokensSomehow() {
  // TODO: тут подставь твой источник новых токенов
  // верни массив вида:
  // [{ address: "0x...", symbol: "ABC", creatorFid: 123 }, ...]
  return [];
}

export async function POST(req: Request) {
  try {
    assertAuth(req);
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const tokens = await getNewTokensSomehow();

  for (const t of tokens) {
    if (!t.creatorFid) continue;

    const scoreResp = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/token-score?fid=${t.creatorFid}&address=${t.address}`,
      { cache: "no-store" }
    );
    if (!scoreResp.ok) continue;

    const data = await scoreResp.json();
    const s = (data.hatchr_score ?? data.hatchr_score_v1) as number | null;

    if (s != null && s >= 0.9) {
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/notify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NOTIFY_ADMIN_TOKEN}`,
        },
        body: JSON.stringify({
          title: "Hatchr Alert 🚨",
          body: `$${t.symbol ?? "NEW"} — Hatchr Score ${(s * 100).toFixed(0)}`,
          targetUrl: `https://hatchr.vercel.app/token/${t.address}`,
        }),
      });
    }
  }

  return NextResponse.json({ ok: true, scanned: tokens.length });
}
