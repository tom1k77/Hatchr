// app/api/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import {
  parseWebhookEvent,
  verifyAppKeyWithNeynar,
  ParseWebhookEvent,
} from "@farcaster/miniapp-node";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// KV key helpers
const keyFor = (fid: number, appFid: number) => `fc:notify:${fid}:${appFid}`;

export async function GET() {
  // Farcaster может дернуть GET чтобы проверить доступность
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const requestJson = await request.json();

  let data: any;
  try {
    data = await parseWebhookEvent(requestJson, verifyAppKeyWithNeynar);
  } catch (e: unknown) {
    const error = e as ParseWebhookEvent.ErrorType;

    // Минимально полезная диагностика
    console.error("Webhook verify failed:", error?.name, error);

    // 400/401 чтобы клиент понял что данные/подпись плохие
    return NextResponse.json(
      { ok: false, error: error?.name ?? "unknown" },
      { status: 401 }
    );
  }

  const fid: number = data.fid;
  const appFid: number = data.appFid; // FID клиента (например Warpcast / Base app)
  const event = data.event; // { event: "...", notificationDetails?: { token, url } }

  try {
    switch (event.event) {
      case "miniapp_added":
      case "notifications_enabled": {
        // Если клиент сразу выдал notificationDetails — сохраняем
        if (event.notificationDetails?.token && event.notificationDetails?.url) {
          await kv.set(keyFor(fid, appFid), {
            fid,
            appFid,
            token: event.notificationDetails.token,
            url: event.notificationDetails.url,
            updatedAt: Date.now(),
          });
        }
        break;
      }

      case "miniapp_removed":
      case "notifications_disabled": {
        await kv.del(keyFor(fid, appFid));
        break;
      }
    }
  } catch (err) {
    console.error("Error processing webhook event:", err);
    // Важно: все равно отвечаем быстро
  }

  // Важно отвечать быстро (≤10s), Base app может ждать успешный ответ  [oai_citation:2‡docs.base.org](https://docs.base.org/mini-apps/core-concepts/notifications?utm_source=chatgpt.com)
  return NextResponse.json({ ok: true });
}
