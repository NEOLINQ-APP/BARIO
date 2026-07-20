import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type Template, type TemplateLicense } from '@/lib/db'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const rows = (await sql`SELECT * FROM templates WHERE id = ${params.id}`) as unknown as Template[]
  const template = rows[0]
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const licenseRows = (await sql`
    SELECT * FROM template_licenses WHERE user_id = ${session.userId} AND template_id = ${params.id}
  `) as unknown as TemplateLicense[]
  const license = licenseRows[0]

  return NextResponse.json({
    id: template.id,
    title: template.title,
    category: template.category,
    description: template.description,
    html: template.html,
    is_premium: template.is_premium,
    price_cents: template.price_cents,
    licenseStatus: license?.status ?? null,
  })
}
