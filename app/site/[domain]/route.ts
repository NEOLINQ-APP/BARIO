import { db, type Site } from '@/lib/db'
import { buildSiteHtml, injectSeoIntoHtml, esc, type Section, type Theme } from '@/lib/renderSite'

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

export async function GET(req: Request, { params }: { params: { domain: string } }) {
  const domain = params.domain.toLowerCase()
  const sql = await db()

  let rows: Site[]
  if (domain.endsWith('.bario.ca')) {
    const subdomain = domain.replace(/\.bario\.ca$/, '')
    rows = (await sql`
      SELECT * FROM sites WHERE subdomain = ${subdomain} AND is_published = true
    `) as unknown as Site[]
  } else {
    const bareDomain = domain.startsWith('www.') ? domain.slice(4) : domain
    rows = (await sql`
      SELECT * FROM sites WHERE custom_domain = ${bareDomain} AND domain_status = 'verified' AND is_published = true
    `) as unknown as Site[]
  }

  const site = rows[0]
  if (!site) {
    return new Response(notFoundHtml(domain), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE_HEADERS },
    })
  }

  const seo = {
    metaTitle: site.meta_title,
    metaDescription: site.meta_description,
    analyticsId: site.analytics_id,
    faviconUrl: site.favicon_url,
  }

  const html =
    site.content_mode === 'template' && site.raw_html
      ? injectSeoIntoHtml(site.raw_html, seo)
      : buildSiteHtml(site.name, JSON.parse(site.sections_json) as Section[], JSON.parse(site.theme_json) as Theme, seo)

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE_HEADERS },
  })
}

function notFoundHtml(domain: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Site not found</title></head>
<body style="font-family:sans-serif;text-align:center;padding:80px 20px;color:#334">
<h1>No site published at ${esc(domain)}</h1>
<p>If this is your domain, make sure the site is published in your Bario dashboard.</p>
</body></html>`
}
