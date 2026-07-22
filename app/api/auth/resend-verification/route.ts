import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { sendVerificationEmail } from '@/lib/email'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user) return NextResponse.json({ error: 'Account not found' }, { status: 401 })
    if (user.email_verified) return NextResponse.json({ error: 'Your email is already verified' }, { status: 400 })

    const ok = await rateLimit(sql, `resend-verify:${user.id}`, 3, 15 * 60)
    if (!ok) return rateLimitResponse()

    const token = randomBytes(32).toString('hex')
    const origin = req.headers.get('origin') ?? 'https://bario.ca'
    await sql`
      INSERT INTO email_verification_tokens (id, user_id, token, expires_at)
      VALUES (${randomBytes(16).toString('hex')}, ${user.id}, ${token}, now() + interval '24 hours')
    `
    await sendVerificationEmail(user.email, `${origin}/verify-email?token=${token}`)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
