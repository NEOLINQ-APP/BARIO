import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Sets (or clears, with an empty string) the internal admin_note surfaced
// into the post-login support assistant's prompt — see
// app/api/assistant/support/route.ts.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { email, note } = await req.json()
    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    const noteValue = typeof note === 'string' && note.trim() ? note.trim() : null

    const rows = (await sql`
      UPDATE users SET admin_note = ${noteValue} WHERE email = ${email.trim().toLowerCase()}
      RETURNING id, email
    `) as unknown as { id: string; email: string }[]

    if (!rows[0]) return NextResponse.json({ error: `No account found for ${email}` }, { status: 404 })

    await logAdminAction(sql, { action: 'set-note', targetEmail: rows[0].email, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true, user: rows[0] })
  } catch (err: any) {
    return errorResponse(err)
  }
}
