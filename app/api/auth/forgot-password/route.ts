import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { db, type User } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/email'
import { rateLimit, rateLimitResponse, clientIp } from '@/lib/rateLimit'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const { email } = await req.json()
    if (typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const sql = await db()
    const normalizedEmail = email.trim().toLowerCase()

    const ipOk = await rateLimit(sql, `forgot:ip:${clientIp(req)}`, 8, 60 * 60)
    const emailOk = await rateLimit(sql, `forgot:email:${normalizedEmail}`, 5, 60 * 60)
    if (!ipOk || !emailOk) return rateLimitResponse()

    const rows = (await sql`SELECT * FROM users WHERE email = ${normalizedEmail}`) as unknown as User[]
    const user = rows[0]

    // Always report success, whether or not the account exists, so this
    // endpoint can't be used to check which emails are registered.
    if (user) {
      const token = randomBytes(32).toString('hex')
      const origin = req.headers.get('origin') ?? 'https://bario.ca'
      await sql`
        INSERT INTO password_reset_tokens (id, user_id, token, expires_at)
        VALUES (${randomBytes(16).toString('hex')}, ${user.id}, ${token}, now() + interval '1 hour')
      `
      await sendPasswordResetEmail(user.email, `${origin}/reset-password?token=${token}`)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
