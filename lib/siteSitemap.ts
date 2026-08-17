// Auto-generates sitemap.xml/robots.txt for any hosted custom domain, from
// that site's actual pages -- there was no platform-level generation at all
// before this (confirmed live: a hosted domain with no site_pages rows for
// "sitemap.xml" just fell through to its own catch-all/homepage content,
// silently serving HTML where a crawler expected XML). This intentionally
// lives in its own file rather than renderSite.ts, which is HTML rendering
// only -- this is a different concern (URL discovery) that happens to read
// the same site data.

import type { Site, SitePage } from './db'
import { parsePagesJson } from './renderSite'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// The canonical host to emit in <loc> -- the site's own custom_domain
// (bare, no www) if connected, else its *.bario.ca subdomain. Deliberately
// NOT the raw `domain` the request came in on, so a sitemap fetched via
// www.example.com and one fetched via example.com both list the same
// canonical URLs rather than duplicating content across both hostnames.
function canonicalHost(site: Site): string {
  return site.custom_domain || `${site.subdomain}.bario.ca`
}

// Real slugs only -- excludes "sitemap.xml"/"robots.txt" themselves in case
// a stray site_pages row exists at those slugs (e.g. a manually-imported
// stub from before this existed), since those paths are now intercepted
// before ever reaching page lookup and would otherwise self-list.
const RESERVED_SLUGS = new Set(['sitemap.xml', 'robots.txt'])

export function getSiteSlugs(site: Site, pageRows: SitePage[]): string[] {
  if (pageRows.length > 0) {
    return pageRows.map((p) => p.slug).filter((s) => !RESERVED_SLUGS.has(s))
  }
  if (site.content_mode === 'template' && site.raw_html) {
    return ['']
  }
  return parsePagesJson(site.sections_json)
    .map((p) => p.slug)
    .filter((s) => !RESERVED_SLUGS.has(s))
}

export function buildSitemapXml(site: Site, slugs: string[]): string {
  const host = canonicalHost(site)
  const urls = slugs
    .map((slug) => {
      const loc = `https://${host}${slug ? `/${slug}` : ''}`
      const priority = slug === '' ? '1.0' : '0.7'
      return `<url><loc>${esc(loc)}</loc><changefreq>weekly</changefreq><priority>${priority}</priority></url>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`
}

export function buildRobotsTxt(site: Site): string {
  const host = canonicalHost(site)
  return `User-agent: *\nAllow: /\n\nSitemap: https://${host}/sitemap.xml\n`
}
