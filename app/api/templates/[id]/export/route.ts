import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type Template, type TemplateLicense } from '@/lib/db'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const templateRows = (await sql`SELECT * FROM templates WHERE id = ${params.id}`) as unknown as Template[]
  const template = templateRows[0]
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  const licenseRows = (await sql`
    SELECT * FROM template_licenses
    WHERE user_id = ${session.userId} AND template_id = ${params.id} AND status = 'active'
  `) as unknown as TemplateLicense[]

  if (!licenseRows[0]) {
    return NextResponse.json({ error: 'An active, approved license is required to export this template' }, { status: 403 })
  }

  return new NextResponse(template.html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${template.id}.html"`,
    },
  })
}
