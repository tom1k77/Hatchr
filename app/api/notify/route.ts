// app/api/notify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ⚠️ Простая защита, чтобы любой не мог дергать отправку
function assertAuth(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!process.env.NOTIFY_ADMIN_TOKEN || token !== process.env.NOTIFY_ADMIN_TOKEN) {
    throw new Error("Unauthorized");
  }
}

export async function POST(req: NextRequest) {
  try {
    assertAuth(req);
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { title, body, targetUrl } = await req.json();

  // Достаём все ключи по префиксу
  const keys: string[] = await kv.keys("fc:notify:*");

  const details = await Promise.all(keys.map((k) => kv.get<any>(k)));
  const valid = details.filter(Boolean);

  // Группируем по url, потому что у разных клиентов может быть разный notification server
  const byUrl = new Map<string, string[]>();
  for (const d of valid) {
    const arr = byUrl.get(d.url) ?? [];
    arr.push(d.token);
    byUrl.set(d.url, arr);
  }

  const results: any[] = [];

  for (const [url, tokens] of byUrl.entries()) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notificationId: crypto.randomUUID(),
        title,
        body,
        targetUrl: targetUrl ?? "https://hatchr.vercel.app",
        tokens,
      }),
    });

    const json = await res.json().catch(() => ({}));
    results.push({ url, status: res.status, response: json });
  }

  return NextResponse.json({ ok: true, sentTo: valid.length, results });
}
