import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { rateLimit, rateLimitResponse, clientIp } from '@/lib/rateLimit'
import { errorResponse } from '@/lib/errors'

// Public support/complaint intake — replaces "email hello@bario.ca" as the
// fallback the support assistant points customers to. Attaches user_id when
// the submitter is logged in (most cases), but also works for a logged-out
// visitor since not every complaint comes from inside an account. This is
// the only real data source the admin AI has for "surface complaints."
export async function POST(req: Request) {
  try {
    const session = await getSession()
    const sql = await db()

    let user: User | null = null
    if (session) {
      const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
      user = rows[0] ?? null
    }

    const { email, subject, message } = await req.json()
    const finalEmail = (user?.email ?? (typeof email === 'string' ? email.trim().toLowerCase() : ''))
    if (!finalEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(finalEmail)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }
    if (typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }
    if (message.length > 4000) {
      return NextResponse.json({ error: 'Message is too long' }, { status: 400 })
    }

    const ok = await rateLimit(sql, `support-contact:${user?.id ?? clientIp(req)}`, 5, 15 * 60)
    if (!ok) return rateLimitResponse()

    await sql`
      INSERT INTO support_messages (id, user_id, email, subject, message)
      VALUES (${randomUUID()}, ${user?.id ?? null}, ${finalEmail}, ${typeof subject === 'string' ? subject.slice(0, 200) : ''}, ${message.trim().slice(0, 4000)})
    `

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
