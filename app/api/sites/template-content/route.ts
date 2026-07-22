import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'
import { isValidGa4Id } from '@/lib/renderSite'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasBuilderAccess(user)) {
      return NextResponse.json({ error: 'An active subscription is required to use templates' }, { status: 403 })
    }

    const { html, metaTitle, metaDescription, analyticsId } = await req.json()
    if (typeof html !== 'string' || !html.trim()) {
      return NextResponse.json({ error: 'html is required' }, { status: 400 })
    }

    const cleanAnalyticsId = typeof analyticsId === 'string' ? analyticsId.trim() : ''
    if (cleanAnalyticsId && !isValidGa4Id(cleanAnalyticsId)) {
      return NextResponse.json({ error: 'Analytics ID must be a GA4 measurement ID, e.g. G-ABC1234DEF' }, { status: 400 })
    }
    const cleanMetaTitle = typeof metaTitle === 'string' && metaTitle.trim() ? metaTitle.trim() : null
    const cleanMetaDescription = typeof metaDescription === 'string' && metaDescription.trim() ? metaDescription.trim() : null

    const rows = (await sql`
      UPDATE sites SET
        raw_html = ${html}, meta_title = ${cleanMetaTitle}, meta_description = ${cleanMetaDescription},
        analytics_id = ${cleanAnalyticsId || null}, updated_at = now()
      WHERE user_id = ${session.userId} AND content_mode = 'template'
      RETURNING id
    `) as unknown as { id: string }[]

    if (!rows[0]) return NextResponse.json({ error: 'No template site found — pick a template first' }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
