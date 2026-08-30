import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasZeusStudioAccess, hasPaidPlan } from '@/lib/access'
import { buildSiteHtml, injectSeoIntoHtml, injectBadgeIntoHtml, parsePagesJson } from '@/lib/renderSite'
import { resolveSiteId } from '@/lib/siteAccess'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, must-revalidate' }

// Owner/admin-only render of a site's *draft* content, using the exact same
// renderer app/site/[domain]/[[...path]]/route.ts uses for the live public
// site -- this is what the builder's "Preview" button opens in a new tab.
// Not publicly link-shareable (no domain/subdomain lookup, session-gated by
// ownership), and deliberately doesn't handle the admin-only multi-page
// site_pages import path -- that's not part of Builder.tsx/TemplateBuilder.tsx's
// normal editing flow.
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = userRows[0]
  if (!user || !hasZeusStudioAccess(user)) {
    return NextResponse.json({ error: 'Please verify your email to use the builder' }, { status: 403 })
  }

  const url = new URL(req.url)
  const requestedSiteId = url.searchParams.get('site')
  const siteId = user.is_admin && requestedSiteId
    ? requestedSiteId
    : await resolveSiteId(sql, session.userId, requestedSiteId)
  if (!siteId) return NextResponse.json({ error: 'No site found to preview' }, { status: 404 })

  const rows = (await sql`SELECT sites.*, users.subscription_status FROM sites JOIN users ON users.id = sites.user_id WHERE sites.id = ${siteId}`) as unknown as any[]
  const site = rows[0]
  if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })
  if (site.user_id !== session.userId && !user.is_admin) {
    return NextResponse.json({ error: 'Not your site' }, { status: 403 })
  }

  const seo = {
    metaTitle: site.draft_meta_title ?? site.meta_title,
    metaDescription: site.draft_meta_description ?? site.meta_description,
    analyticsId: site.draft_analytics_id ?? site.analytics_id,
    faviconUrl: site.favicon_url,
  }
  const showBadge = !hasPaidPlan(site) || site.show_badge
  const slug = url.searchParams.get('path') ?? ''

  let html: string
  if (site.content_mode === 'template') {
    const rawHtml = site.draft_raw_html ?? site.raw_html
    if (!rawHtml) return NextResponse.json({ error: 'This site has no content yet' }, { status: 404 })
    html = injectBadgeIntoHtml(injectSeoIntoHtml(rawHtml, seo), showBadge)
  } else {
    const pages = parsePagesJson(site.draft_sections_json ?? site.sections_json)
    const isLegacySinglePage = pages.length === 1 && pages[0].slug === ''
    if (!isLegacySinglePage && slug !== '' && !pages.some((p) => p.slug === slug)) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }
    const theme = JSON.parse(site.draft_theme_json ?? site.theme_json)
    const name = site.draft_name ?? site.name
    html = buildSiteHtml(name, pages, isLegacySinglePage ? '' : slug, theme, seo, showBadge)
  }

  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE_HEADERS } })
}
