import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db, type User } from '@/lib/db'
import { createSession } from '@/lib/session'
import { rateLimit, rateLimitResponse, clientIp } from '@/lib/rateLimit'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json()

    if (typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const sql = await db()
    const normalizedEmail = email.trim().toLowerCase()

    const ipOk = await rateLimit(sql, `login:ip:${clientIp(req)}`, 20, 15 * 60)
    const emailOk = await rateLimit(sql, `login:email:${normalizedEmail}`, 10, 15 * 60)
    if (!ipOk || !emailOk) return rateLimitResponse()

    const rows = (await sql`SELECT * FROM users WHERE email = ${normalizedEmail}`) as unknown as User[]
    const user = rows[0]

    // Always run bcrypt.compare, even with no user, to avoid leaking account
    // existence via response-time differences.
    const valid = await bcrypt.compare(password, user?.password_hash ?? '$2a$10$invalidsaltinvalidsaltin')

    if (!user || !valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    await createSession(user.id, user.session_version)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
