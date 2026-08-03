import { randomUUID, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db, type User } from '@/lib/db'
import { hashPersonalAccessToken } from '@/lib/session'
import { rateLimit, rateLimitResponse, clientIp } from '@/lib/rateLimit'
import { errorResponse } from '@/lib/errors'

// "Log in" flow for the X-Drive desktop sync client — verifies real
// credentials exactly like app/api/auth/login/route.ts, but instead of
// setting a browser session cookie, issues a long-lived opaque bearer
// token the native app can hold in its OS credential store. The raw token
// is only ever returned here, once — only its SHA-256 hash is stored
// (lib/db.ts's personal_access_tokens), same "never store the secret
// itself" principle as password_hash.
export async function POST(req: Request) {
  try {
    const { email, password, deviceName } = await req.json()

    if (typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }
    const normalizedEmail = email.trim().toLowerCase()
    const name = typeof deviceName === 'string' && deviceName.trim() ? deviceName.trim().slice(0, 100) : 'Unnamed device'

    const sql = await db()

    const ipOk = await rateLimit(sql, `device-token:ip:${clientIp(req)}`, 20, 15 * 60)
    const emailOk = await rateLimit(sql, `device-token:email:${normalizedEmail}`, 10, 15 * 60)
    if (!ipOk || !emailOk) return rateLimitResponse()

    const rows = (await sql`SELECT * FROM users WHERE email = ${normalizedEmail}`) as unknown as User[]
    const user = rows[0]

    // Always run bcrypt.compare, even with no user, to avoid leaking
    // account existence via response-time differences — same reasoning as
    // the browser login route.
    const valid = await bcrypt.compare(password, user?.password_hash ?? '$2a$10$invalidsaltinvalidsaltin')
    if (!user || !valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const rawToken = randomBytes(32).toString('base64url')
    await sql`
      INSERT INTO personal_access_tokens (id, user_id, token_hash, device_name)
      VALUES (${randomUUID()}, ${user.id}, ${hashPersonalAccessToken(rawToken)}, ${name})
    `

    return NextResponse.json({ ok: true, token: rawToken })
  } catch (err: any) {
    return errorResponse(err)
  }
}
