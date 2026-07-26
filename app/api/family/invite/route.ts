import { NextResponse } from 'next/server'
import { randomUUID, randomBytes } from 'node:crypto'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { MAX_FAMILY_MEMBERS } from '@/lib/storageTiers'
import { sendFamilyInviteEmail } from '@/lib/email'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = rows[0]
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (!user.family_group_id) return NextResponse.json({ error: 'Enable family sharing first' }, { status: 400 })

    const groupRows = (await sql`SELECT owner_user_id FROM family_groups WHERE id = ${user.family_group_id}`) as { owner_user_id: string }[]
    if (groupRows[0]?.owner_user_id !== user.id) {
      return NextResponse.json({ error: 'Only the plan owner can invite members' }, { status: 403 })
    }

    const { email } = await req.json()
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }

    const [members, pendingInvites] = await Promise.all([
      sql`SELECT id FROM users WHERE family_group_id = ${user.family_group_id}` as unknown as Promise<{ id: string }[]>,
      sql`SELECT id FROM family_invites WHERE family_group_id = ${user.family_group_id} AND status = 'pending'` as unknown as Promise<{ id: string }[]>,
    ])
    if (members.length + pendingInvites.length >= MAX_FAMILY_MEMBERS) {
      return NextResponse.json({ error: `Family plans are limited to ${MAX_FAMILY_MEMBERS} members` }, { status: 400 })
    }

    const token = randomBytes(24).toString('hex')
    const id = randomUUID()
    await sql`
      INSERT INTO family_invites (id, family_group_id, email, token, expires_at)
      VALUES (${id}, ${user.family_group_id}, ${email.toLowerCase()}, ${token}, now() + interval '7 days')
    `

    const origin = req.headers.get('origin') ?? 'https://bario.ca'
    await sendFamilyInviteEmail(email, user.email, `${origin}/family/accept?token=${token}`)

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
