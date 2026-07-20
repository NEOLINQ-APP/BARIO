import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const templates = (await sql`
    SELECT id, title, category, description, is_premium, price_cents FROM templates ORDER BY title
  `) as unknown as { id: string; title: string; category: string; description: string; is_premium: boolean; price_cents: number }[]

  const licenses = (await sql`
    SELECT template_id, status FROM template_licenses WHERE user_id = ${session.userId}
  `) as unknown as { template_id: string; status: string }[]

  const licenseByTemplate = new Map(licenses.map((l) => [l.template_id, l.status]))

  return NextResponse.json({
    templates: templates.map((t) => ({
      ...t,
      licenseStatus: licenseByTemplate.get(t.id) ?? null,
    })),
  })
}
