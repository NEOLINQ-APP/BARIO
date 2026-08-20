import { db, type Site, type SitePage } from '@/lib/db'
import { buildSiteHtml, injectSeoIntoHtml, injectBadgeIntoHtml, parsePagesJson, esc } from '@/lib/renderSite'
import { hasPaidPlan } from '@/lib/access'
import { buildRobotsTxt, buildSitemapXml, getSiteSlugs } from '@/lib/siteSitemap'

// Route Handlers are statically cached by default in the App Router. Without
// something here, the first successful render of a given hostname gets
// cached indefinitely, so unpublishing, editing, or disconnecting a domain
// would silently have no effect on what's actually served. This used to be
// `force-dynamic` + `revalidate: 0` (no caching at all, anywhere) — that
// meant every single visitor to every hosted site re-fetched the full site
// row from Postgres, including `raw_html`/`sections_json` blobs that run
// well past 1MB on real sites. With real traffic across ~25 hosted domains,
// that was the single largest driver of the project's Supabase egress
// (394% over the free-tier quota in one billing cycle, confirmed via
// Postgres logs before this fix).
//
// 2026-08-15 fix was a 30s TTL, which helped but wasn't enough on its own —
// egress hit the free-tier cap again by 2026-08-19 (confirmed by Supabase's
// own dashboard: ~10MB DB, 2.69GB egress in one cycle), severely enough
// that the connection pool itself became unusable and every DB-touching
// route platform-wide started hanging/timing out, not just this one.
// Pushed to 300s (5 min) here — a real site edit now takes up to 5 minutes
// to show live instead of 30s, which is a fair trade against the platform
// going fully unusable. Error/state-change responses (404, maintenance
// lockout) intentionally keep the old no-store behavior below — those need
// to reflect a state flip (site just published, lockout just cleared)
// faster than any positive-response cache window, and they're much cheaper
// to regenerate than a full page render anyway.
export const revalidate = 300
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, must-revalidate' }
const CACHED_HEADERS = { 'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600' }

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

  // Every hosted site gets a real sitemap.xml/robots.txt generated from its
  // actual pages -- there was no platform-level generation before this (a
  // site with no manually-imported page at these exact slugs just fell
  // through to its own catch-all/homepage, silently serving HTML where a
  // crawler expected XML/plain text). Intercepted here, before any
  // per-page lookup, so these two paths can never collide with a real page.
  if (slug === 'sitemap.xml') {
    const slugs = getSiteSlugs(site, pageRows)
    return new Response(buildSitemapXml(site, slugs), {
      status: 200,
      headers: { 'Content-Type': 'application/xml; charset=utf-8', ...CACHED_HEADERS },
    })
  }
  if (slug === 'robots.txt') {
    return new Response(buildRobotsTxt(site), {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CACHED_HEADERS },
    })
  }

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
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...CACHED_HEADERS },
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
