import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyFamilyToken } from '@/lib/victoriaFamilyAccess'
import { errorResponse } from '@/lib/errors'

// Stores the browser's real Web Push subscription (from
// pushManager.subscribe() client-side) so Victoria can push a notification
// to this member's phone even when the app isn't open — used for reminders
// and anything else she wants to proactively tell them. One subscription
// per member (re-subscribing overwrites, e.g. after reinstalling the app).
// iOS Safari only supports this once the app is actually added to the home
// screen (Settings > Add to Home Screen) — a subscribe attempt from a plain
// browser tab on iOS will fail client-side before this route is ever hit.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const memberKey = typeof body?.member === 'string' ? body.member : null
    const token = typeof body?.token === 'string' ? body.token : null
    const subscription = body?.subscription

    const sql = await db()
    const member = await verifyFamilyToken(sql, memberKey, token)
    if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (subscription === null) {
      await sql`UPDATE victoria_family_members SET push_subscription_json = NULL WHERE key = ${member.key}`
      return NextResponse.json({ ok: true, unsubscribed: true })
    }

    if (!subscription || typeof subscription.endpoint !== 'string') {
      return NextResponse.json({ error: 'subscription is required' }, { status: 400 })
    }

    await sql`UPDATE victoria_family_members SET push_subscription_json = ${JSON.stringify(subscription)} WHERE key = ${member.key}`
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
