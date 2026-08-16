import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Suspend blocks login (app/api/auth/login) AND kicks out any already-live
// session on its very next request (lib/session.ts's getSession() checks
// suspended_at in real time) — bumping session_version too is a second,
// independent layer of the same guarantee, not redundant.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { userId } = await req.json()
    if (typeof userId !== 'string' || !userId.trim()) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const rows = (await sql`
      UPDATE users SET suspended_at = now(), session_version = session_version + 1
      WHERE id = ${userId}
      RETURNING id, email
    `) as unknown as { id: string; email: string }[]
    if (!rows[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    await logAdminAction(sql, { action: 'user-suspended', targetEmail: rows[0].email, params: { userId }, result: 'ok' })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
