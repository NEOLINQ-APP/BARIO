import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'
import { errorResponse } from '@/lib/errors'

// Creates a pending_payment wp_sites row, mirrors app/api/vps/configure —
// no tier/billing-cycle choice needed (single flat monthly product, like
// Voice Agent), so this is just an ownership+eligibility check plus the
// row insert.
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasBuilderAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email first' }, { status: 403 })
    }

    const siteId = randomUUID()
    await sql`INSERT INTO wp_sites (id, user_id, status) VALUES (${siteId}, ${user.id}, 'pending_payment')`

    return NextResponse.json({ ok: true, siteId })
  } catch (err: any) {
    return errorResponse(err)
  }
}
