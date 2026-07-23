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
    return NextResponse.json({ error: 'Please verify your email to use templates' }, { status: 403 })
  }

  const rows = (await sql`SELECT * FROM templates WHERE id = ${params.id}`) as unknown as Template[]
  const template = rows[0]
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  return NextResponse.json({
    id: template.id,
    title: template.title,
    category: template.category,
    description: template.description,
    html: template.html,
  })
}
