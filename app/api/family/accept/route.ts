import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User, type FamilyInvite } from '@/lib/db'
import { MAX_FAMILY_MEMBERS } from '@/lib/storageTiers'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = rows[0]
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    if (user.family_group_id) return NextResponse.json({ error: 'You already belong to a family group — leave it first' }, { status: 400 })

    const { token } = await req.json()
    if (typeof token !== 'string' || !token) {
      return NextResponse.json({ error: 'Invite token is required' }, { status: 400 })
    }

    const inviteRows = (await sql`SELECT * FROM family_invites WHERE token = ${token}`) as unknown as FamilyInvite[]
    const invite = inviteRows[0]
    if (!invite || invite.status !== 'pending' || new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This invite is invalid or has expired' }, { status: 400 })
    }
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json({ error: `This invite was sent to ${invite.email} — log in with that email to accept it` }, { status: 403 })
    }

    const members = (await sql`SELECT id FROM users WHERE family_group_id = ${invite.family_group_id}`) as unknown as { id: string }[]
    if (members.length >= MAX_FAMILY_MEMBERS) {
      return NextResponse.json({ error: 'This family plan is already full' }, { status: 400 })
    }

    await sql`UPDATE users SET family_group_id = ${invite.family_group_id} WHERE id = ${user.id}`
    await sql`UPDATE family_invites SET status = 'accepted' WHERE id = ${invite.id}`

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
