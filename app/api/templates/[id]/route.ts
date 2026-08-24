import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User, type Template } from '@/lib/db'
import { hasZeusStudioAccess, hasPaidPlan } from '@/lib/access'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = userRows[0]
  if (!user || !hasZeusStudioAccess(user)) {
    return NextResponse.json({ error: 'Please verify your email to use templates' }, { status: 403 })
  }

  const rows = (await sql`SELECT * FROM templates WHERE id = ${params.id}`) as unknown as Template[]
  const template = rows[0]
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  let purchased = false
  if (template.is_premium) {
    const licenseRows = (await sql`
      SELECT 1 FROM template_licenses WHERE template_id = ${template.id} AND user_id = ${user.id} AND status = 'active'
    `) as unknown as unknown[]
    purchased = licenseRows.length > 0
  }
  const unlocked = !template.is_premium || hasPaidPlan(user) || purchased

  // The preview stays visible to everyone regardless of purchase — what's
  // actually gated is "Use This Template" (copying it into your own site to
  // edit, export, and publish), handled by /api/sites/use-template.
  return NextResponse.json({
    id: template.id,
    title: template.title,
    category: template.category,
    description: template.description,
    html: template.html,
    is_premium: template.is_premium,
    price_cents: template.price_cents,
    unlocked,
  })
}
