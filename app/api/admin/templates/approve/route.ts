import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = userRows[0]
  if (!user?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { licenseId, action } = await req.json()
  if (!licenseId || (action !== 'approve' && action !== 'revoke')) {
    return NextResponse.json({ error: 'licenseId and a valid action are required' }, { status: 400 })
  }

  const newStatus = action === 'approve' ? 'active' : 'revoked'
  await sql`UPDATE template_licenses SET status = ${newStatus} WHERE id = ${licenseId}`

  return NextResponse.json({ ok: true })
}
