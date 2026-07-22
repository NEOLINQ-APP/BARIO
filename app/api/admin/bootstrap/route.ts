import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

// Temporary one-time-use route — removed right after use.
export async function POST(req: Request) {
  const secret = req.headers.get('x-bootstrap-secret')
  if (!secret || secret !== process.env.ADMIN_BOOTSTRAP_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, password } = await req.json()
  if (typeof email !== 'string' || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'email and an 8+ character password are required' }, { status: 400 })
  }

  const sql = await db()
  const normalizedEmail = email.trim().toLowerCase()

  // Diagnostic: how many rows currently match this email, and what do they look like?
  const before = (await sql`
    SELECT id, is_admin, email_verified, session_version, password_hash FROM users WHERE email = ${normalizedEmail}
  `) as unknown as { id: string; is_admin: boolean; email_verified: boolean; session_version: number; password_hash: string }[]

  const hash = await bcrypt.hash(password, 10)

  const rows = (await sql`
    UPDATE users
    SET password_hash = ${hash}, is_admin = true, email_verified = true, session_version = session_version + 1
    WHERE email = ${normalizedEmail}
    RETURNING id, password_hash, session_version
  `) as unknown as { id: string; password_hash: string; session_version: number }[]

  if (!rows[0]) return NextResponse.json({ error: 'No account with that email' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    matchingRowsBeforeUpdate: before.length,
    matchingRowsUpdated: rows.length,
    rowIds: rows.map((r) => r.id),
    sessionVersion: rows[0].session_version,
  })
}
