import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { hasPaidPlan } from '@/lib/access'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Admin equivalent of the showBadge half of /api/sites/publish — that route
// is session-gated (an owner toggling their own site's badge), which doesn't
// help when the admin needs to do this on a managed/client account's behalf.
// Same enforcement: only actually takes effect if the owning account has a
// paid plan, checked server-side same as the session route (badge removal
// is a paid perk, not just a UI toggle).
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { siteId, showBadge } = await req.json()
    if (typeof siteId !== 'string' || !siteId.trim()) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 })
    }
    if (typeof showBadge !== 'boolean') {
      return NextResponse.json({ error: 'showBadge (boolean) is required' }, { status: 400 })
    }

    const rows = (await sql`
      SELECT sites.id, users.subscription_status, users.is_admin, users.email
      FROM sites JOIN users ON users.id = sites.user_id
      WHERE sites.id = ${siteId}
    `) as unknown as { id: string; subscription_status: string; is_admin: boolean; email: string }[]
    const site = rows[0]
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

    if (!showBadge && !hasPaidPlan(site)) {
      return NextResponse.json({ error: `${site.email}'s account isn't on a paid plan — badge removal requires one` }, { status: 403 })
    }

    await sql`UPDATE sites SET show_badge = ${showBadge} WHERE id = ${siteId}`

    await logAdminAction(sql, { action: 'set-badge', targetEmail: site.email, params: { siteId, showBadge }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true, siteId, showBadge })
  } catch (err: any) {
    return errorResponse(err)
  }
}
