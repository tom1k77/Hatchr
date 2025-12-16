// app/api/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import {
  parseWebhookEvent,
  verifyAppKeyWithNeynar,
} from "@farcaster/miniapp-node";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

type StoredNotif = {
  fid: number;
  url: string;
  token: string;
  updatedAt: string;
};

function subKey(fid: number) {
  return `fc:notif:${fid}`;
}

const SUB_SET_KEY = "fc:notif:subs"; // список всех подписчиков (set)

export async function GET() {
  // Farcaster может пинговать URL на доступность
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  try {
    if (!NEYNAR_API_KEY) {
      return NextResponse.json({ ok: false, error: "Missing NEYNAR_API_KEY" }, { status: 500 });
    }

    const rawBody = await req.text();
    const evt = await parseWebhookEvent(rawBody);

    // Проверка, что вебхук реально от Farcaster / валидный app key
    const ok = await verifyAppKeyWithNeynar({
      neynarApiKey: NEYNAR_API_KEY,
      appKey: evt.appKey,
    });

    if (!ok) {
      return NextResponse.json({ ok: false, error: "Invalid appKey" }, { status: 401 });
    }

    // События подписки/отписки на уведомления
    // В evt обычно есть fid + notificationDetails (url, token)
    const fid = evt?.fid;
    const notificationDetails = evt?.notificationDetails;

    if (typeof fid !== "number") {
      return NextResponse.json({ ok: true, ignored: true });
    }

    // subscribe
    if (notificationDetails?.token && notificationDetails?.url) {
      const data: StoredNotif = {
        fid,
        url: notificationDetails.url,
        token: notificationDetails.token,
        updatedAt: new Date().toISOString(),
      };

      await kv.set(subKey(fid), data);
      await kv.sadd(SUB_SET_KEY, String(fid));

      return NextResponse.json({ ok: true, stored: true });
    }

    // unsubscribe (если пришло событие без notificationDetails или явная отписка)
    // (у разных версий payload это может отличаться, поэтому делаем безопасно)
    const eventType = (evt as any)?.type ?? (evt as any)?.event ?? null;
    const isUnsub =
      eventType === "notifications.unsubscribe" ||
      eventType === "miniapp.notifications.unsubscribe" ||
      eventType === "unsubscribe";

    if (isUnsub) {
      await kv.del(subKey(fid));
      await kv.srem(SUB_SET_KEY, String(fid));
      return NextResponse.json({ ok: true, removed: true });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[webhook] error", e);
    return NextResponse.json({ ok: false, error: "Webhook error" }, { status: 500 });
  }
}
