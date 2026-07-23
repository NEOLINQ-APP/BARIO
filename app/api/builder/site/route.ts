import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'
import { isValidGa4Id } from '@/lib/renderSite'
import { resolveSiteId } from '@/lib/siteAccess'
import { errorResponse } from '@/lib/errors'

const DEFAULT_THEME = { primary: '#0A2342', accent: '#1a56db' }

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = userRows[0]
  if (!user || !hasBuilderAccess(user)) {
    return NextResponse.json({ error: 'Please verify your email to use the builder' }, { status: 403 })
  }

  const requestedSiteId = new URL(req.url).searchParams.get('site')
  const siteId = await resolveSiteId(sql, session.userId, requestedSiteId)

  const rows = siteId
    ? ((await sql`SELECT * FROM sites WHERE id = ${siteId}`) as unknown as {
        id: string
        name: string
        sections_json: string
        theme_json: string
        meta_title: string | null
        meta_description: string | null
        analytics_id: string | null
        favicon_url: string | null
      }[])
    : []
  const site = rows[0]

  return NextResponse.json({
    id: site?.id ?? null,
    name: site?.name ?? 'My Site',
    sections: site ? JSON.parse(site.sections_json) : [],
    theme: site ? JSON.parse(site.theme_json) : DEFAULT_THEME,
    metaTitle: site?.meta_title ?? '',
    metaDescription: site?.meta_description ?? '',
    analyticsId: site?.analytics_id ?? '',
    faviconUrl: site?.favicon_url ?? '',
  })
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasBuilderAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email to use the builder' }, { status: 403 })
    }

    const { siteId: requestedSiteId, name, sections, theme, metaTitle, metaDescription, analyticsId } = await req.json()
    if (!Array.isArray(sections)) {
      return NextResponse.json({ error: 'sections must be an array' }, { status: 400 })
    }

    const cleanAnalyticsId = typeof analyticsId === 'string' ? analyticsId.trim() : ''
    if (cleanAnalyticsId && !isValidGa4Id(cleanAnalyticsId)) {
      return NextResponse.json({ error: 'Analytics ID must be a GA4 measurement ID, e.g. G-ABC1234DEF' }, { status: 400 })
    }

    const siteId = await resolveSiteId(sql, session.userId, requestedSiteId)
    const sectionsJson = JSON.stringify(sections)
    const themeJson = JSON.stringify(theme ?? DEFAULT_THEME)
    const siteName = typeof name === 'string' && name.trim() ? name.trim() : 'My Site'
    const cleanMetaTitle = typeof metaTitle === 'string' && metaTitle.trim() ? metaTitle.trim() : null
    const cleanMetaDescription = typeof metaDescription === 'string' && metaDescription.trim() ? metaDescription.trim() : null

    let finalId = siteId
    if (siteId) {
      await sql`
        UPDATE sites SET
          name = ${siteName}, sections_json = ${sectionsJson}, theme_json = ${themeJson},
          meta_title = ${cleanMetaTitle}, meta_description = ${cleanMetaDescription},
          analytics_id = ${cleanAnalyticsId || null}, updated_at = now()
        WHERE id = ${siteId}
      `
    } else {
      finalId = randomUUID()
      await sql`
        INSERT INTO sites (id, user_id, name, sections_json, theme_json, meta_title, meta_description, analytics_id)
        VALUES (${finalId}, ${session.userId}, ${siteName}, ${sectionsJson}, ${themeJson}, ${cleanMetaTitle}, ${cleanMetaDescription}, ${cleanAnalyticsId || null})
      `
    }

    return NextResponse.json({ ok: true, id: finalId })
  } catch (err: any) {
    return errorResponse(err)
  }
}
