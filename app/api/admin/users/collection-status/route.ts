import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { sendPaymentReminderEmail } from '@/lib/email'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

const VALID_STATUSES = ['none', 'reminder_sent', 'warning_shown', 'locked'] as const
type Status = (typeof VALID_STATUSES)[number]

// Manual 3-strike payment-collection escalation, per site, for accounts
// built outside the normal Stripe flow. GET looks up a user's sites +
// current status (same pattern as ../sites); POST sets a new status and
// fires the side effect for that stage (email for reminder_sent — the
// dashboard popup and site lockout are read live off collection_status by
// the dashboard page and the site-serving route, no separate action needed
// there).
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const email = new URL(req.url).searchParams.get('email')
    if (!email?.trim()) return NextResponse.json({ error: 'email query param is required' }, { status: 400 })

    const userRows = (await sql`SELECT id, email FROM users WHERE email = ${email.trim().toLowerCase()}`) as unknown as { id: string; email: string }[]
    const targetUser = userRows[0]
    if (!targetUser) return NextResponse.json({ error: `No account found for ${email}` }, { status: 404 })

    const sites = await sql`
      SELECT id, name, subdomain, custom_domain, collection_status, collection_note, collection_updated_at
      FROM sites WHERE user_id = ${targetUser.id} ORDER BY updated_at DESC
    `
    return NextResponse.json({ ok: true, user: targetUser, sites })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { siteId, status, note } = await req.json()
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
    }

    const rows = (await sql`
      SELECT sites.id, sites.name, users.email FROM sites JOIN users ON users.id = sites.user_id WHERE sites.id = ${siteId}
    `) as unknown as { id: string; name: string; email: string }[]
    const site = rows[0]
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

    await sql`
      UPDATE sites SET collection_status = ${status}, collection_note = ${note ?? null}, collection_updated_at = now()
      WHERE id = ${siteId}
    `

    if ((status as Status) === 'reminder_sent') {
      await sendPaymentReminderEmail(site.email, site.name)
    }

    await logAdminAction(sql, {
      action: 'collection-status-set',
      targetEmail: site.email,
      params: { siteId, status, note },
      result: 'ok',
      triggeredBy: 'admin',
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
