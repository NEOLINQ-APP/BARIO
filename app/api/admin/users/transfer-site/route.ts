import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Admin tool for moving a site's ownership from one account to another —
// e.g. an agency-managed client site (built/hosted under the agency's own
// account) handed off to the client's own BARIO login. Only touches
// sites.user_id; subdomain/custom_domain/domain_status/content stay as-is,
// so a connected custom domain keeps resolving without re-verification.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { siteId, toEmail } = await req.json()
    if (typeof siteId !== 'string' || !siteId.trim()) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 })
    }
    if (typeof toEmail !== 'string' || !toEmail.trim()) {
      return NextResponse.json({ error: 'toEmail is required' }, { status: 400 })
    }

    const userRows = (await sql`SELECT id FROM users WHERE email = ${toEmail.trim().toLowerCase()}`) as unknown as { id: string }[]
    const targetUser = userRows[0]
    if (!targetUser) {
      await logAdminAction(sql, { action: 'transfer-site', targetEmail: toEmail, params: { siteId }, result: 'error', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
      return NextResponse.json({ error: `No account found for ${toEmail}` }, { status: 404 })
    }

    const rows = (await sql`
      UPDATE sites SET user_id = ${targetUser.id}, updated_at = now()
      WHERE id = ${siteId}
      RETURNING id, name, user_id, custom_domain
    `) as unknown as { id: string; name: string; user_id: string; custom_domain: string | null }[]
    const site = rows[0]
    if (!site) {
      await logAdminAction(sql, { action: 'transfer-site', targetEmail: toEmail, params: { siteId }, result: 'error', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
      return NextResponse.json({ error: 'Site not found' }, { status: 404 })
    }

    await logAdminAction(sql, { action: 'transfer-site', targetEmail: toEmail, params: { siteId, name: site.name, toUserId: targetUser.id }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true, site })
  } catch (err: any) {
    return errorResponse(err)
  }
}
