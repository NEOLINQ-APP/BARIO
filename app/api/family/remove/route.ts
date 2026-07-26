import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = rows[0]
    if (!user?.family_group_id) return NextResponse.json({ error: 'Not in a family group' }, { status: 400 })

    const groupRows = (await sql`SELECT owner_user_id FROM family_groups WHERE id = ${user.family_group_id}`) as { owner_user_id: string }[]
    if (groupRows[0]?.owner_user_id !== user.id) {
      return NextResponse.json({ error: 'Only the plan owner can remove members' }, { status: 403 })
    }

    const { userId } = await req.json()
    if (typeof userId !== 'string' || userId === user.id) {
      return NextResponse.json({ error: 'Invalid member' }, { status: 400 })
    }

    await sql`UPDATE users SET family_group_id = NULL WHERE id = ${userId} AND family_group_id = ${user.family_group_id}`

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
