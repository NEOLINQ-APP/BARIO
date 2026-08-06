import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { provisionWpSharedSite } from '@/lib/wpSharedProvision'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const url = new URL(req.url)
    const status = url.searchParams.get('status')
    const sites = status
      ? await sql`
          SELECT s.*, u.email FROM wp_sites s JOIN users u ON u.id = s.user_id
          WHERE s.status = ${status} ORDER BY s.created_at DESC
        `
      : await sql`
          SELECT s.*, u.email FROM wp_sites s JOIN users u ON u.id = s.user_id
          ORDER BY s.created_at DESC
        `
    return NextResponse.json({ ok: true, sites })
  } catch (err) {
    return errorResponse(err)
  }
}

// Admin-comped shared-hosting site — same purpose as /api/admin/vps/create:
// hand a customer (or, here, a test) a site without a real Stripe payment
// behind it. Skips pending_payment entirely and provisions immediately.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const { email } = await req.json()
    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    const userRows = (await sql`SELECT id FROM users WHERE email = ${email.trim().toLowerCase()}`) as unknown as { id: string }[]
    const targetUser = userRows[0]
    if (!targetUser) {
      await logAdminAction(sql, { action: 'wp-hosting-site-create', targetEmail: email, result: 'error', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
      return NextResponse.json({ error: `No account found for ${email}` }, { status: 404 })
    }

    const siteId = randomUUID()
    await sql`INSERT INTO wp_sites (id, user_id, status) VALUES (${siteId}, ${targetUser.id}, 'awaiting_provision')`
    await provisionWpSharedSite(sql, siteId)

    const rows = await sql`SELECT * FROM wp_sites WHERE id = ${siteId}`
    await logAdminAction(sql, { action: 'wp-hosting-site-create', targetEmail: email, params: { siteId }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true, site: rows[0] })
  } catch (err) {
    return errorResponse(err)
  }
}
