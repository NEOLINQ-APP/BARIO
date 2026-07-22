import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

// Temporary, one-time-use route to set a password and grant admin on an
// existing account without needing direct DB access. Gated by a secret set
// only via `vercel env add` (never read back) — this file and the env var
// are both removed right after use.
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

  const rows = (await sql`
    UPDATE users
    SET password_hash = ${hash}, is_admin = true, email_verified = true, session_version = session_version + 1
    WHERE email = ${normalizedEmail}
    RETURNING id
  `) as unknown as { id: string }[]

  if (!rows[0]) return NextResponse.json({ error: 'No account with that email' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
