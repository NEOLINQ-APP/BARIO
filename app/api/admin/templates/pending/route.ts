import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = userRows[0]
  if (!user?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const pending = (await sql`
    SELECT
      tl.id, tl.license_key, tl.status, tl.created_at,
      u.email AS user_email,
      t.title AS template_title
    FROM template_licenses tl
    JOIN users u ON u.id = tl.user_id
    JOIN templates t ON t.id = tl.template_id
    WHERE tl.status = 'pending_approval'
    ORDER BY tl.created_at ASC
  `) as unknown as { id: string; license_key: string; status: string; created_at: string; user_email: string; template_title: string }[]

  return NextResponse.json({ pending })
}
