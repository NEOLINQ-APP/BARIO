import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

// Temporary diagnostic/one-time-use route — removed right after use.
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
  const hash = await bcrypt.hash(password, 10)
  const selfCheck = await bcrypt.compare(password, hash)

  const rows = (await sql`
    UPDATE users
    SET password_hash = ${hash}, is_admin = true, email_verified = true, session_version = session_version + 1
    WHERE email = ${normalizedEmail}
    RETURNING id, password_hash, session_version
  `) as unknown as { id: string; password_hash: string; session_version: number }[]

  if (!rows[0]) return NextResponse.json({ error: 'No account with that email' }, { status: 404 })

  const storedMatches = await bcrypt.compare(password, rows[0].password_hash)

  return NextResponse.json({
    ok: true,
    selfCheckBeforeStore: selfCheck,
    storedHashMatchesAfterReread: storedMatches,
    hashPrefix: rows[0].password_hash.slice(0, 7),
    sessionVersion: rows[0].session_version,
  })
}
