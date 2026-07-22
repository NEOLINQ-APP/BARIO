import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { randomUUID, randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { createSession } from '@/lib/session'
import { rateLimit, rateLimitResponse, clientIp } from '@/lib/rateLimit'
import { sendVerificationEmail } from '@/lib/email'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json()

    if (typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const sql = await db()
    const normalizedEmail = email.trim().toLowerCase()

    const ipOk = await rateLimit(sql, `signup:ip:${clientIp(req)}`, 8, 60 * 60)
    if (!ipOk) return rateLimitResponse()

    const existing = (await sql`SELECT id FROM users WHERE email = ${normalizedEmail}`) as unknown as unknown[]
    if (existing.length > 0) {
      return NextResponse.json({ error: 'An account with that email already exists' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const id = randomUUID()

    await sql`
      INSERT INTO users (id, email, password_hash)
      VALUES (${id}, ${normalizedEmail}, ${passwordHash})
    `

    const token = randomBytes(32).toString('hex')
    const origin = req.headers.get('origin') ?? 'https://bario.ca'
    await sql`
      INSERT INTO email_verification_tokens (id, user_id, token, expires_at)
      VALUES (${randomBytes(16).toString('hex')}, ${id}, ${token}, now() + interval '24 hours')
    `
    try {
      await sendVerificationEmail(normalizedEmail, `${origin}/verify-email?token=${token}`)
    } catch (err) {
      // Non-fatal: the account still works, and they can resend from the dashboard.
      console.error('Failed to send verification email', err)
    }

    await createSession(id, 0)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
