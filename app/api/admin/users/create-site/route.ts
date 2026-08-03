import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Admin equivalent of POST /api/sites — creates a new blank site on an
// account regardless of whether they already have one. Needed because
// resolveSiteId() (used by import-html/connect-domain when no siteId is
// given) always prefers an existing site over creating a new one, so
// there's no way to add a *second* site onto an agency account without
// this. Admin accounts bypass the plan site-limit check entirely.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { email, name } = await req.json()
    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const userRows = (await sql`SELECT id FROM users WHERE email = ${email.trim().toLowerCase()}`) as unknown as { id: string }[]
    const targetUser = userRows[0]
    if (!targetUser) {
      await logAdminAction(sql, { action: 'create-site', targetEmail: email, result: 'error', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
      return NextResponse.json({ error: `No account found for ${email} — they need to sign up first` }, { status: 404 })
    }

    const id = randomUUID()
    await sql`
      INSERT INTO sites (id, user_id, name)
      VALUES (${id}, ${targetUser.id}, ${typeof name === 'string' && name.trim() ? name.trim() : 'My Site'})
    `

    await logAdminAction(sql, { action: 'create-site', targetEmail: email, params: { siteId: id, name }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
