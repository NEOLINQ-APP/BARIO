import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { resolveSiteId } from '@/lib/siteAccess'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

const ACTIONS = ['restore', 'publish', 'unpublish']

// Admin tool for live-fixing a broken site without touching anything
// financial: swap in the last-known-good raw_html snapshot (see
// raw_html_backup, written by both import-html routes before every
// overwrite), or take a site down/back up. Deliberately narrow — no delete,
// no way to touch billing — so this is safe to expose to the admin AI's
// autonomous tool-calling.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { email, siteId: requestedSiteId, action } = await req.json()
    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    if (!ACTIONS.includes(action)) {
      return NextResponse.json({ error: `Action must be one of: ${ACTIONS.join(', ')}` }, { status: 400 })
    }

    const userRows = (await sql`SELECT id FROM users WHERE email = ${email.trim().toLowerCase()}`) as unknown as { id: string }[]
    const targetUser = userRows[0]
    if (!targetUser) {
      await logAdminAction(sql, { action: `restore-site:${action}`, targetEmail: email, result: 'error', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
      return NextResponse.json({ error: `No account found for ${email}` }, { status: 404 })
    }

    const siteId = await resolveSiteId(sql, targetUser.id, typeof requestedSiteId === 'string' ? requestedSiteId : null)
    if (!siteId) {
      await logAdminAction(sql, { action: `restore-site:${action}`, targetEmail: email, result: 'error', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
      return NextResponse.json({ error: `No site found for ${email}` }, { status: 404 })
    }

    let rows: { id: string; is_published: boolean }[]
    if (action === 'restore') {
      rows = (await sql`
        UPDATE sites SET raw_html = raw_html_backup, updated_at = now()
        WHERE id = ${siteId} AND raw_html_backup IS NOT NULL
        RETURNING id, is_published
      `) as unknown as { id: string; is_published: boolean }[]
      if (!rows[0]) {
        await logAdminAction(sql, { action: 'restore-site:restore', targetEmail: email, params: { siteId }, result: 'error', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
        return NextResponse.json({ error: 'No backup snapshot available for this site' }, { status: 400 })
      }
    } else {
      rows = (await sql`
        UPDATE sites SET is_published = ${action === 'publish'}, updated_at = now()
        WHERE id = ${siteId}
        RETURNING id, is_published
      `) as unknown as { id: string; is_published: boolean }[]
    }

    await logAdminAction(sql, { action: `restore-site:${action}`, targetEmail: email, params: { siteId }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true, site: rows[0] })
  } catch (err: any) {
    return errorResponse(err)
  }
}
