import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_TOKEN = process.env.CRON_TOKEN;

type StoredNotif = {
  fid: number;
  url: string;
  token: string;
  updatedAt: string;
};

function subKey(fid: number) {
  return `fc:notif:${fid}`;
}

const SUB_SET_KEY = "fc:notif:subs";

async function sendOne(n: StoredNotif, title: string, body: string, targetUrl: string) {
  const resp = await fetch(n.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${n.token}`,
    },
    body: JSON.stringify({ title, body, targetUrl }),
  });

  return resp.ok;
}

export async function POST(req: NextRequest) {
  // защита от чужих запросов
  const token = req.headers.get("x-cron-token");
  if (!CRON_TOKEN || token !== CRON_TOKEN) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { title, body, targetUrl, minScore } = await req.json().catch(() => ({}));

  // TODO: здесь ты подставишь реальный список токенов и проверку hatchr_score
  // пока просто “тестовая рассылка”
  const fids = await kv.smembers<string>(SUB_SET_KEY);

  let sent = 0;
  for (const fidStr of fids) {
    const fid = Number(fidStr);
    if (!Number.isFinite(fid)) continue;

    const data = await kv.get<StoredNotif>(subKey(fid));
    if (!data?.url || !data?.token) continue;

    const ok = await sendOne(
      data,
      title ?? "Hatchr Alert 🚨",
      body ?? `New token matched your filter (score >= ${minScore ?? 90})`,
      targetUrl ?? "https://hatchr.vercel.app"
    );

    if (ok) sent += 1;
  }

  return NextResponse.json({ ok: true, total: fids.length, sent });
}
