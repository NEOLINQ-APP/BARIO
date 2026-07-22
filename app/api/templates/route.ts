import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = userRows[0]
  if (!user || !hasBuilderAccess(user)) {
    return NextResponse.json({ error: 'An active subscription is required to use templates' }, { status: 403 })
  }

  const templates = (await sql`
    SELECT id, title, category, description FROM templates ORDER BY title
  `) as unknown as { id: string; title: string; category: string; description: string }[]

  return NextResponse.json({ templates })
}
