import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type SendBody = {
  notificationId: string;
  title: string;
  body: string;
  targetUrl: string;
};

function asString(x: any) {
  return typeof x === "string" ? x : "";
}

function clampLen(s: string, max: number) {
  if (!s) return s;
  return s.length > max ? s.slice(0, max) : s;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: Request) {
  try {
    const json = (await req.json().catch(() => null)) as Partial<SendBody> | null;

    const notificationId = clampLen(asString(json?.notificationId).trim(), 128);
    const title = clampLen(asString(json?.title).trim(), 32);
    const body = clampLen(asString(json?.body).trim(), 128);
    const targetUrl = clampLen(asString(json?.targetUrl).trim(), 1024);

    if (!notificationId || !title || !body || !targetUrl) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields: notificationId, title, body, targetUrl" },
        { status: 400 }
      );
    }

    // Берём активные токены (лимит 100 на один запрос к farcaster, но мы будем батчить)
    const { rows } = await sql`
      select token, url
      from miniapp_notification_tokens
      where status = 'enabled'
      order by updated_at desc
      limit 2000
    `;

    if (!rows?.length) {
      return NextResponse.json({ ok: true, sent: 0, detail: [] });
    }

    // Группируем по url (важно: разные Farcaster clients могут дать разные notificationUrl)
    const byUrl = new Map<string, string[]>();
    for (const r of rows) {
      const t = asString((r as any)?.token).trim();
      const u = asString((r as any)?.url).trim();
      if (!t || !u) continue;

      const list = byUrl.get(u) ?? [];
      list.push(t);
      byUrl.set(u, list);
    }

    const results: any[] = [];
    let totalSentAttempts = 0;

    for (const [sendUrl, tokensAll] of byUrl) {
      const batches = chunk(tokensAll, 100); // max 100 tokens per request  [oai_citation:4‡Farcaster Mini Apps](https://miniapps.farcaster.xyz/docs/specification?utm_source=chatgpt.com)

      for (const tokens of batches) {
        totalSentAttempts += tokens.length;

        const res = await fetch(sendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notificationId,
            title,
            body,
            targetUrl,
            tokens,
          }),
        });

        const txt = await res.text().catch(() => "");
        let data: any = null;
        try {
          data = txt ? JSON.parse(txt) : null;
        } catch {
          data = { raw: txt };
        }

        // если invalidTokens — помечаем disabled
        const invalid: string[] = Array.isArray(data?.invalidTokens) ? data.invalidTokens : [];
        if (invalid.length) {
          // одним запросом пачкой
          await sql`
            update miniapp_notification_tokens
            set status = 'disabled', updated_at = now()
            where token = any(${invalid}::text[])
          `;
        }

        results.push({
          url: sendUrl,
          ok: res.ok,
          status: res.status,
          successfulTokens: data?.successfulTokens ?? [],
          invalidTokens: invalid,
          rateLimitedTokens: data?.rateLimitedTokens ?? [],
        });
      }
    }

    return NextResponse.json({
      ok: true,
      sent_attempts: totalSentAttempts,
      detail: results,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
