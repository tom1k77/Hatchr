import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const { notificationId, title, body, targetUrl } = await req.json()

  // берём активные токены (до 100 за запрос — лимит)  [oai_citation:10‡miniapps.farcaster.xyz](https://miniapps.farcaster.xyz/docs/guides/notifications)
  const { rows } = await sql`
    select token, url
    from miniapp_notification_tokens
    where status = 'enabled'
    order by updated_at desc
    limit 100
  `

  if (rows.length === 0) return NextResponse.json({ ok: true, sent: 0 })

  // По доке отправлять надо POST на "url" из notificationDetails  [oai_citation:11‡miniapps.farcaster.xyz](https://miniapps.farcaster.xyz/docs/guides/notifications)
  // В большинстве случаев url одинаковый (api.farcaster.xyz/...), возьмём первый
  const sendUrl = rows[0].url
  const tokens = rows.map(r => r.token)

  const res = await fetch(sendUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      notificationId,
      title,
      body,
      targetUrl,
      tokens,
    }),
  })

  const data = await res.json()

  // если есть invalidTokens — помечаем disabled
  if (data?.invalidTokens?.length) {
    for (const t of data.invalidTokens) {
      await sql`update miniapp_notification_tokens set status='disabled', updated_at=now() where token=${t}`
    }
  }

  return NextResponse.json({ ok: true, farcaster: data })
}
