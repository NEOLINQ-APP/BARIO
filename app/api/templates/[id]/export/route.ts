import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User, type Template } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = userRows[0]
  if (!user || !hasBuilderAccess(user)) {
    return NextResponse.json({ error: 'An active subscription is required to export templates' }, { status: 403 })
  }

  const templateRows = (await sql`SELECT * FROM templates WHERE id = ${params.id}`) as unknown as Template[]
  const template = templateRows[0]
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  return new NextResponse(template.html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${template.id}.html"`,
    },
  })
}
