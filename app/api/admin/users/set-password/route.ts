import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Manually sets a temporary password on an account — for cases where the
// owner can't complete the normal forgot-password flow (e.g. transactional
// email isn't reaching them). Bumps session_version like a real reset does,
// so any existing session is invalidated and this password must actually be
// used to log back in.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { email, password } = await req.json()
    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const rows = (await sql`
      UPDATE users
      SET password_hash = ${passwordHash}, session_version = session_version + 1
      WHERE email = ${email.trim().toLowerCase()}
      RETURNING id, email
    `) as unknown as { id: string; email: string }[]

    if (!rows[0]) {
      await logAdminAction(sql, { action: 'set-password', targetEmail: email, result: 'error', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
      return NextResponse.json({ error: `No account found for ${email}` }, { status: 404 })
    }

    // Never log the password itself — just the fact that one was set.
    await logAdminAction(sql, { action: 'set-password', targetEmail: rows[0].email, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true, user: rows[0] })
  } catch (err: any) {
    return errorResponse(err)
  }
}
