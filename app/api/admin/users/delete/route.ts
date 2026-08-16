import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Soft delete, deliberately — a hard DELETE FROM users would violate
// foreign keys on essentially every real account (sites, invoices, VPS
// instances, X-Drive files, etc. all reference users.id with no cascade),
// and even where cascading IS possible, silently destroying billing/invoice
// history on a single click is a real financial-record risk. This instead:
// scrubs the email (frees it up for reuse, matches the UNIQUE constraint),
// blanks the password hash (login becomes cryptographically impossible, not
// just blocked), and suspends + bumps session_version (same real-time
// kick-out as /suspend). The row and all related history stay intact.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { userId } = await req.json()
    if (typeof userId !== 'string' || !userId.trim()) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const existing = (await sql`SELECT id, email FROM users WHERE id = ${userId}`) as unknown as { id: string; email: string }[]
    if (!existing[0]) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (existing[0].email.startsWith('deleted-')) {
      return NextResponse.json({ error: 'This account is already deleted' }, { status: 400 })
    }

    const anonymizedEmail = `deleted-${userId}@deleted.bario.ca`
    await sql`
      UPDATE users SET
        email = ${anonymizedEmail},
        password_hash = 'deleted',
        suspended_at = now(),
        session_version = session_version + 1,
        admin_note = COALESCE(admin_note || E'\n', '') || 'Account deleted ' || now()::text || ' (was: ' || ${existing[0].email} || ')'
      WHERE id = ${userId}
    `

    await logAdminAction(sql, { action: 'user-deleted', targetEmail: existing[0].email, params: { userId }, result: 'ok' })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
