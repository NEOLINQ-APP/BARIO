import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { getActiveOrgForUser, inviteMember } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

// Invite a teammate — owner/admin only, seat-limit-checked inside
// inviteMember() (see lib/barioOne.ts).
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user) return NextResponse.json({ error: 'Account not found' }, { status: 401 })

    const found = await getActiveOrgForUser(sql, user.id)
    if (!found) return NextResponse.json({ error: 'No Bario One organization found' }, { status: 404 })
    const { org, membership } = found
    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return NextResponse.json({ error: 'Only owners and admins can invite teammates' }, { status: 403 })
    }

    const { email, role } = await req.json()
    if (typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }
    if (role !== 'admin' && role !== 'employee') {
      return NextResponse.json({ error: 'Role must be admin or employee' }, { status: 400 })
    }

    const origin = req.headers.get('origin') ?? 'https://bario.ca'
    const result = await inviteMember(sql, org.id, user.email, email, role, origin)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
