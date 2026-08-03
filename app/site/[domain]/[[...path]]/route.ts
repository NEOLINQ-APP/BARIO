import { db, type Site, type SitePage } from '@/lib/db'
import { buildSiteHtml, injectSeoIntoHtml, injectBadgeIntoHtml, parsePagesJson, esc } from '@/lib/renderSite'
import { hasPaidPlan } from '@/lib/access'

// Route Handlers are statically cached by default in the App Router. Without
// this, the first successful render of a given hostname gets cached
// indefinitely, so unpublishing, editing, or disconnecting a domain would
// silently have no effect on what's actually served. The explicit
// Cache-Control: no-store header below is a second, independent guarantee —
// this route is reached via a middleware rewrite (one hostname per site),
// and Vercel's rewrite-caching layer can cache the response at the edge
// regardless of what Next.js's own `dynamic` export says.
export const dynamic = 'force-dynamic'
export const revalidate = 0
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, must-revalidate' }

// [[...path]] is an OPTIONAL catch-all — params.path is undefined at the
// site root (middleware forwards '' there) and a string[] for any deeper
// path. The domain lookup below is unchanged from the original single-page
// route this replaced.
export async function GET(req: Request, { params }: { params: { domain: string; path?: string[] } }) {
  const domain = params.domain.toLowerCase()
  const sql = await db()

  let rows: (Site & { subscription_status: string; is_admin: boolean })[]
  if (domain.endsWith('.bario.ca')) {
    const subdomain = domain.replace(/\.bario\.ca$/, '')
    rows = (await sql`
      SELECT sites.*, users.subscription_status, users.is_admin FROM sites
      JOIN users ON users.id = sites.user_id
      WHERE sites.subdomain = ${subdomain} AND sites.is_published = true
    `) as unknown as (Site & { subscription_status: string; is_admin: boolean })[]
  } else {
    const bareDomain = domain.startsWith('www.') ? domain.slice(4) : domain
    rows = (await sql`
      SELECT sites.*, users.subscription_status, users.is_admin FROM sites
      JOIN users ON users.id = sites.user_id
      WHERE sites.custom_domain = ${bareDomain} AND sites.domain_status = 'verified' AND sites.is_published = true
    `) as unknown as (Site & { subscription_status: string; is_admin: boolean })[]
  }

  const site = rows[0]
  if (!site) {
    return new Response(notFoundHtml(domain), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE_HEADERS },
    })
  }

  // Manual payment-collection lockout (see app/api/admin/users/collection-status)
  // — takes priority over everything else below; a locked site serves this
  // page regardless of content_mode until an admin clears the status.
  if ((site as any).collection_status === 'locked') {
    return new Response(maintenanceHtml(), {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE_HEADERS },
    })
  }

  const seo = {
    metaTitle: site.meta_title,
    metaDescription: site.meta_description,
    analyticsId: site.analytics_id,
    faviconUrl: site.favicon_url,
  }

  // Badge is forced on unless the owner is actively paying AND has chosen
  // to turn it off — free hosting for everyone, badge removal is the perk.
  const showBadge = !hasPaidPlan(site) || site.show_badge

  const slug = (params.path ?? []).join('/')

  // Multi-page raw-HTML lookup: only sites with rows in site_pages opt into
  // path-aware rendering via that table (used for raw-HTML/template-mode
  // multi-page imports, e.g. a migrated WordPress export). A site with zero
  // rows here is unaffected regardless of content_mode.
  const pageRows = (await sql`SELECT * FROM site_pages WHERE site_id = ${site.id}`) as unknown as SitePage[]

  let rawHtml: string | null = null
  let notFound = false

  if (pageRows.length > 0) {
    const page = slug === ''
      ? pageRows.find((p) => p.is_home) ?? pageRows[0]
      : pageRows.find((p) => p.slug === slug)
    if (page) {
      rawHtml = page.raw_html
    } else {
      notFound = true
    }
  }

  if (notFound) {
    return new Response(notFoundHtml(domain), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE_HEADERS },
    })
  }

  let html: string
  if (pageRows.length > 0 && rawHtml) {
    html = injectBadgeIntoHtml(injectSeoIntoHtml(rawHtml, seo), showBadge)
  } else if (site.content_mode === 'template' && site.raw_html) {
    // Single raw_html blob, no site_pages rows — always single-page,
    // ignores the requested path entirely (unchanged legacy behavior).
    html = injectBadgeIntoHtml(injectSeoIntoHtml(site.raw_html, seo), showBadge)
  } else {
    // AI/section-builder sites. sections_json is either a bare array
    // (legacy — one implicit page, renders regardless of path, same as
    // before multi-page existed) or { pages: [...] } (multi-page — resolve
    // the requested slug, 404 if it doesn't match any page).
    const pages = parsePagesJson(site.sections_json)
    const isLegacySinglePage = pages.length === 1 && pages[0].slug === ''
    if (!isLegacySinglePage && slug !== '' && !pages.some((p) => p.slug === slug)) {
      return new Response(notFoundHtml(domain), {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE_HEADERS },
      })
    }
    const theme = JSON.parse(site.theme_json)
    html = buildSiteHtml(site.name, pages, isLegacySinglePage ? '' : slug, theme, seo, showBadge)
  }

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE_HEADERS },
  })
}

function maintenanceHtml() {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Site under maintenance</title></head>
<body style="font-family:sans-serif;text-align:center;padding:80px 20px;color:#334">
<h1>This website is temporarily unavailable</h1>
<p>Please contact <a href="mailto:support@bario.ca">support@bario.ca</a> for assistance.</p>
</body></html>`
}

function notFoundHtml(domain: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Site not found</title></head>
<body style="font-family:sans-serif;text-align:center;padding:80px 20px;color:#334">
<h1>No site published at ${esc(domain)}</h1>
<p>If this is your domain, make sure the site is published in your Bario dashboard.</p>
</body></html>`
}
