import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { requireAdmin } from '@/lib/admin'
import type { VictoriaFamilyMember } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// Sends a real Web Push notification to a family member's phone — called by
// server.js (miko-voice, on the VPS) using the same BARIO_ADMIN_API_KEY it
// already authenticates admin calls with, e.g. from the reminder scanner
// when an appointment/medication reminder fires. Silently no-ops (still
// 200s) if the member has no stored subscription yet — SMS stays the
// reliable fallback for anyone who hasn't enabled push, so a missing
// subscription is a real, expected, non-error state, not a failure.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const body = await req.json().catch(() => ({}))
    const memberKey = typeof body?.member === 'string' ? body.member.trim().toLowerCase() : ''
    const title = typeof body?.title === 'string' ? body.title : 'Victoria'
    const message = typeof body?.message === 'string' ? body.message.trim() : ''
    if (!memberKey || !message) {
      return NextResponse.json({ error: 'member and message are required' }, { status: 400 })
    }

    const rows = (await sql`SELECT * FROM victoria_family_members WHERE key = ${memberKey}`) as unknown as VictoriaFamilyMember[]
    const member = rows[0]
    if (!member) return NextResponse.json({ error: `No family member found for key "${memberKey}"` }, { status: 404 })

    if (!member.push_subscription_json) {
      return NextResponse.json({ ok: true, sent: false, reason: 'no push subscription on file for this member' })
    }

    const vapidPublic = process.env.VAPID_PUBLIC_KEY
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY
    if (!vapidPublic || !vapidPrivate) {
      return NextResponse.json({ error: 'VAPID keys are not configured' }, { status: 500 })
    }
    webpush.setVapidDetails('mailto:support@bario.ca', vapidPublic, vapidPrivate)

    const subscription = JSON.parse(member.push_subscription_json)
    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify({ title, body: message, url: `https://www.bario.ca/victoria-family/${memberKey}` })
      )
      return NextResponse.json({ ok: true, sent: true })
    } catch (pushErr: any) {
      // 404/410 means the subscription is dead (uninstalled, permission
      // revoked, etc.) -- clear it so future sends don't keep retrying a
      // subscription that will never work again.
      if (pushErr?.statusCode === 404 || pushErr?.statusCode === 410) {
        await sql`UPDATE victoria_family_members SET push_subscription_json = NULL WHERE key = ${memberKey}`
        return NextResponse.json({ ok: true, sent: false, reason: 'subscription expired, cleared' })
      }
      throw pushErr
    }
  } catch (err) {
    return errorResponse(err)
  }
}
