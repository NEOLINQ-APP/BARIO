import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getSession } from '@/lib/session'
import { db, type User, type Template } from '@/lib/db'
import { hasPaidPlan } from '@/lib/access'
import { resolveSiteId } from '@/lib/siteAccess'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasPaidPlan(user)) {
      return NextResponse.json({ error: 'Upgrade to a paid plan to use premium templates' }, { status: 403 })
    }

    const { templateId, siteId: requestedSiteId } = await req.json()
    if (typeof templateId !== 'string' || !templateId) {
      return NextResponse.json({ error: 'templateId is required' }, { status: 400 })
    }

    const templateRows = (await sql`SELECT * FROM templates WHERE id = ${templateId}`) as unknown as Template[]
    const template = templateRows[0]
    if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

    const siteId = await resolveSiteId(sql, session.userId, requestedSiteId)

    let finalId = siteId
    if (siteId) {
      await sql`
        UPDATE sites SET
          name = ${template.title}, raw_html = ${template.html}, content_mode = 'template', updated_at = now()
        WHERE id = ${siteId}
      `
    } else {
      finalId = randomUUID()
      await sql`
        INSERT INTO sites (id, user_id, name, raw_html, content_mode)
        VALUES (${finalId}, ${session.userId}, ${template.title}, ${template.html}, 'template')
      `
    }

    return NextResponse.json({ ok: true, id: finalId })
  } catch (err: any) {
    return errorResponse(err)
  }
}
