import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Manually marks an account's email verified, bypassing the normal
// click-the-link flow — for cases where transactional email isn't
// reaching the account (e.g. sender domain not verified with the email
// provider) and the account owner is otherwise confirmed legitimate.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { email } = await req.json()
    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const rows = (await sql`
      UPDATE users
      SET email_verified = true
      WHERE email = ${email.trim().toLowerCase()}
      RETURNING id, email, email_verified
    `) as unknown as { id: string; email: string; email_verified: boolean }[]

    if (!rows[0]) {
      await logAdminAction(sql, { action: 'verify-email', targetEmail: email, result: 'error', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
      return NextResponse.json({ error: `No account found for ${email}` }, { status: 404 })
    }

    await logAdminAction(sql, { action: 'verify-email', targetEmail: rows[0].email, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true, user: rows[0] })
  } catch (err: any) {
    return errorResponse(err)
  }
}
