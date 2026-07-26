import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getSession } from '@/lib/session'
import { db, type User, type FamilyInvite } from '@/lib/db'
import { isStorageTierKey } from '@/lib/storageTiers'
import { errorResponse } from '@/lib/errors'

async function loadUser(sql: any, userId: string): Promise<User | null> {
  const rows = (await sql`SELECT * FROM users WHERE id = ${userId}`) as unknown as User[]
  return rows[0] ?? null
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const user = await loadUser(sql, session.userId)
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    if (!user.family_group_id) {
      return NextResponse.json({ group: null })
    }

    const groupRows = (await sql`SELECT owner_user_id FROM family_groups WHERE id = ${user.family_group_id}`) as { owner_user_id: string }[]
    const ownerId = groupRows[0]?.owner_user_id
    const members = (await sql`SELECT id, email FROM users WHERE family_group_id = ${user.family_group_id}`) as { id: string; email: string }[]
    const isOwner = ownerId === user.id

    const invites = isOwner
      ? ((await sql`SELECT id, email, status, expires_at FROM family_invites WHERE family_group_id = ${user.family_group_id} AND status = 'pending'`) as unknown as FamilyInvite[])
      : []

    return NextResponse.json({ group: { id: user.family_group_id, ownerId, isOwner, members, invites } })
  } catch (err: any) {
    return errorResponse(err)
  }
}

// Enables family sharing for the caller's own storage subscription — requires
// a paid tier (matches every real-world "family plan" being an upgrade over
// solo, not a free-tier perk) and not already belonging to a group.
export async function POST() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const user = await loadUser(sql, session.userId)
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    if (user.family_group_id) {
      return NextResponse.json({ error: 'You already belong to a family group' }, { status: 400 })
    }
    if (!isStorageTierKey(user.storage_tier) || user.storage_tier === 'free') {
      return NextResponse.json({ error: 'Family sharing requires a paid storage plan' }, { status: 403 })
    }

    const id = randomUUID()
    await sql`INSERT INTO family_groups (id, owner_user_id) VALUES (${id}, ${user.id})`
    await sql`UPDATE users SET family_group_id = ${id} WHERE id = ${user.id}`

    return NextResponse.json({ ok: true, groupId: id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
