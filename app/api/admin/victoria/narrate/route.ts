import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// Lets Claude Code (this coding session, running outside the Victoria app
// entirely) post a one-way status update into Sherwin's Victoria app chat —
// so when he opens the app, he sees what got done while he was away, even
// though this session and Victoria are genuinely separate systems with no
// live/bidirectional link. Inserted as an 'outbound' row exactly like a
// real reply, so it renders identically to anything Victoria herself says
// in app/api/victoria/app/chat/route.ts's history.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const body = await req.json().catch(() => ({}))
    const message = typeof body?.message === 'string' ? body.message.trim() : ''
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : 'uniquegroup.org@gmail.com'
    if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 })

    const userRows = (await sql`SELECT id FROM users WHERE email = ${email}`) as unknown as { id: string }[]
    const user = userRows[0]
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    await sql`
      INSERT INTO victoria_app_messages (id, user_id, direction, body)
      VALUES (${randomUUID()}, ${user.id}, 'outbound', ${message})
    `

    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
