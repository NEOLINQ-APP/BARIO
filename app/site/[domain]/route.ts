import { db, type Site } from '@/lib/db'
import { buildSiteHtml, esc, type Section, type Theme } from '@/lib/renderSite'

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
    return new Response(notFoundHtml(domain), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }

  const sections: Section[] = JSON.parse(site.sections_json)
  const theme: Theme = JSON.parse(site.theme_json)
  const html = buildSiteHtml(site.name, sections, theme, {
    metaTitle: site.meta_title,
    metaDescription: site.meta_description,
    analyticsId: site.analytics_id,
  })

  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

function notFoundHtml(domain: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Site not found</title></head>
<body style="font-family:sans-serif;text-align:center;padding:80px 20px;color:#334">
<h1>No site published at ${esc(domain)}</h1>
<p>If this is your domain, make sure the site is published in your Bario dashboard.</p>
</body></html>`
}
