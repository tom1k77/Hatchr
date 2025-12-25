import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import {
  parseWebhookEvent,
  verifyAppKeyWithNeynar,
} from '@farcaster/miniapp-node'

export const runtime = 'nodejs' // важно для crypto/проверок

export async function POST(req: Request) {
  const body = await req.json()

  // проверяем подпись события (рекомендовано докой)
  // verifyAppKeyWithNeynar использует NEYNAR_API_KEY в env
  const data = await parseWebhookEvent(body, verifyAppKeyWithNeynar)

  // data.event: miniapp_added | miniapp_removed | notifications_enabled | notifications_disabled
  // data.fid: кто это
  const fid = Number((data as any).fid ?? 0)

  const event = (data as any).event
  const notificationDetails = (data as any).notificationDetails

  if (!fid) return NextResponse.json({ ok: false, error: 'No fid' }, { status: 400 })

  if (event === 'miniapp_added' || event === 'notifications_enabled') {
    if (notificationDetails?.token && notificationDetails?.url) {
      await sql`
        insert into miniapp_notification_tokens (fid, token, url, status)
        values (${fid}, ${notificationDetails.token}, ${notificationDetails.url}, 'enabled')
        on conflict (fid, token) do update set
          url = excluded.url,
          status = 'enabled',
          updated_at = now()
      `
    }
  }

  if (event === 'miniapp_removed' || event === 'notifications_disabled') {
    await sql`
      update miniapp_notification_tokens
      set status = 'disabled', updated_at = now()
      where fid = ${fid}
    `
  }

  return NextResponse.json({ ok: true })
}
