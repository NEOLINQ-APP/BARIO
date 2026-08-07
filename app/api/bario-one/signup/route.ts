import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { randomUUID, randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { getSession, createSession } from '@/lib/session'
import { createOrganizationWithOwner } from '@/lib/barioOne'
import { isBoPlan } from '@/lib/barioOneTiers'
import { rateLimit, rateLimitResponse, clientIp } from '@/lib/rateLimit'
import { sendVerificationEmail } from '@/lib/email'
import { errorResponse } from '@/lib/errors'

// Creates a Bario account (if the visitor isn't already logged in) and, in
// the same call, an Organization with them as owner + a trial. Mirrors
// /api/auth/signup for the account-creation half — kept as its own route
// rather than reusing that one directly, since Bario One's signup form also
// collects companyName/plan and needs to run the org-creation step in the
// same request.
export async function POST(req: Request) {
  try {
    const { email, password, companyName, plan } = await req.json()

    if (typeof companyName !== 'string' || !companyName.trim()) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
    }
    if (typeof plan !== 'string' || !isBoPlan(plan) || plan === 'enterprise') {
      return NextResponse.json({ error: 'Choose a valid plan' }, { status: 400 })
    }

    const sql = await db()
    const existingSession = await getSession()
    let userId: string

    if (existingSession) {
      userId = existingSession.userId
    } else {
      if (typeof email !== 'string' || !email.includes('@')) {
        return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
      }
      if (typeof password !== 'string' || password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
      }

      const normalizedEmail = email.trim().toLowerCase()
      const ipOk = await rateLimit(sql, `bo-signup:ip:${clientIp(req)}`, 8, 60 * 60)
      if (!ipOk) return rateLimitResponse()

      const existing = (await sql`SELECT id FROM users WHERE email = ${normalizedEmail}`) as unknown as { id: string }[]
      if (existing.length > 0) {
        return NextResponse.json({ error: 'An account with that email already exists — log in first, then start Bario One from your dashboard' }, { status: 409 })
      }

      const passwordHash = await bcrypt.hash(password, 10)
      userId = randomUUID()
      await sql`INSERT INTO users (id, email, password_hash) VALUES (${userId}, ${normalizedEmail}, ${passwordHash})`

      const token = randomBytes(32).toString('hex')
      const origin = req.headers.get('origin') ?? 'https://bario.ca'
      await sql`
        INSERT INTO email_verification_tokens (id, user_id, token, expires_at)
        VALUES (${randomBytes(16).toString('hex')}, ${userId}, ${token}, now() + interval '24 hours')
      `
      try {
        await sendVerificationEmail(normalizedEmail, `${origin}/verify-email?token=${token}`)
      } catch (err) {
        console.error('Failed to send verification email', err)
      }
    }

    const org = await createOrganizationWithOwner(sql, userId, companyName.trim(), plan)

    if (!existingSession) await createSession(userId, 0)

    return NextResponse.json({ ok: true, orgId: org.id, orgSlug: org.slug })
  } catch (err: any) {
    return errorResponse(err)
  }
}
