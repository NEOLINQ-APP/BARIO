import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasZeusStudioAccess, hasPaidPlan } from '@/lib/access'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = userRows[0]
  if (!user || !hasZeusStudioAccess(user)) {
    return NextResponse.json({ error: 'Please verify your email to use templates' }, { status: 403 })
  }

  const rows = (await sql`
    SELECT t.id, t.title, t.category, t.description, t.is_premium, t.price_cents,
           EXISTS(
             SELECT 1 FROM template_licenses l
             WHERE l.template_id = t.id AND l.user_id = ${user.id} AND l.status = 'active'
           ) AS purchased
    FROM templates t ORDER BY t.title
  `) as unknown as { id: string; title: string; category: string; description: string; is_premium: boolean; price_cents: number; purchased: boolean }[]

  const paidPlan = hasPaidPlan(user)
  const templates = rows.map((t) => ({ ...t, unlocked: !t.is_premium || paidPlan || t.purchased }))

  return NextResponse.json({ templates })
}
