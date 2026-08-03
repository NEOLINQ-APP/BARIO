import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Marks an account is_admin — unconditionally satisfies every paid-feature
// check in the codebase (hasPaidPlan, hasBuilderAccess) and every admin
// site-limit bypass, rather than comping a specific plan. Intended for
// accounts that ARE the platform operator (e.g. the agency account managing
// client sites on their behalf), not as a substitute for grant-plan when
// what's actually needed is "give this customer a plan."
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
      UPDATE users SET is_admin = true WHERE email = ${email.trim().toLowerCase()}
      RETURNING id, email, is_admin
    `) as unknown as { id: string; email: string; is_admin: boolean }[]

    if (!rows[0]) {
      await logAdminAction(sql, { action: 'grant-admin', targetEmail: email, result: 'error', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
      return NextResponse.json({ error: `No account found for ${email}` }, { status: 404 })
    }

    await logAdminAction(sql, { action: 'grant-admin', targetEmail: rows[0].email, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true, user: rows[0] })
  } catch (err: any) {
    return errorResponse(err)
  }
}
