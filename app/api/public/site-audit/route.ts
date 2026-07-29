import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import * as cheerio from 'cheerio'
import { db } from '@/lib/db'
import { assertPublicHost } from '@/lib/ssrf'
import { errorResponse } from '@/lib/errors'

// This is the free, no-login "Site Health & Static-Readiness Audit" — a
// lead-gen teaser, not the actual migration. It only ever reads and counts;
// it never writes a site, rehosts an image, or touches site_pages. Kept
// deliberately cheaper/smaller than the paid crawler in every dimension
// (fewer pages, shorter timeouts, no image fetching) since it's public and
// unauthenticated rather than paid-tier-gated.
export const maxDuration = 60

const MAX_PAGES = 20
const MAX_SITEMAP_URLS = 60
const FETCH_TIMEOUT_MS = 8000
const RATE_LIMIT_PER_HOUR = 5

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; BarioSiteAudit/1.0; +https://bario.ca)' },
    })
  } finally {
    clearTimeout(t)
  }
}

// Tries the two conventional sitemap locations (a plain sitemap.xml, and
// WordPress 5.5+'s built-in wp-sitemap.xml) for an authoritative page count
// straight from the site's own index — this is usually far more accurate
// than counting links discovered by crawling, which undercounts anything
// not reachable from the nav. Handles one level of sitemap-index nesting
// (a sitemap that just lists other sitemaps) since that's the common case
// for larger sites.
async function countFromSitemap(origin: string): Promise<number | null> {
  for (const path of ['/sitemap.xml', '/wp-sitemap.xml']) {
    try {
      const res = await fetchWithTimeout(origin + path)
      if (!res.ok) continue
      const xml = await res.text()
      const $ = cheerio.load(xml, { xmlMode: true })
      const sitemapRefs = $('sitemapindex sitemap loc').toArray().map((el) => $(el).text().trim())
      if (sitemapRefs.length > 0) {
        let total = 0
        for (const ref of sitemapRefs.slice(0, 5)) {
          try {
            const sub = await fetchWithTimeout(ref)
            if (!sub.ok) continue
            const subXml = await sub.text()
            total += cheerio.load(subXml, { xmlMode: true })('urlset url loc').length
          } catch {}
        }
        if (total > 0) return total
      }
      const directCount = $('urlset url loc').length
      if (directCount > 0) return directCount
    } catch {}
  }
  return null
}

export async function POST(req: Request) {
  try {
    // bario.ca is Cloudflare-fronted — x-forwarded-for's first entry is
    // Cloudflare's own (rotating) edge IP, not the real client, so the rate
    // limit would never accumulate per visitor. cf-connecting-ip is the one
    // Cloudflare sets itself to the true origin IP, immune to spoofing since
    // it overwrites whatever a client sends. Falls back to x-forwarded-for
    // for local/non-Cloudflare requests.
    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

    const sql = await db()
    const recentRows = (await sql`
      SELECT count(*)::int AS count FROM audit_requests WHERE ip = ${ip} AND created_at > now() - interval '1 hour'
    `) as unknown as { count: number }[]
    if (recentRows[0].count >= RATE_LIMIT_PER_HOUR) {
      return NextResponse.json({ error: "You've hit the free audit limit for now — try again in a bit." }, { status: 429 })
    }

    const { url: rawUrl } = await req.json().catch(() => ({}))
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
      return NextResponse.json({ error: 'A website URL is required' }, { status: 400 })
    }

    let startUrl: URL
    try {
      const withScheme = rawUrl.trim().startsWith('http') ? rawUrl.trim() : `https://${rawUrl.trim()}`
      startUrl = new URL(withScheme)
    } catch {
      return NextResponse.json({ error: "That URL doesn't look valid" }, { status: 400 })
    }
    if (!/^https?:$/.test(startUrl.protocol)) {
      return NextResponse.json({ error: 'Only http/https URLs are supported' }, { status: 400 })
    }
    try {
      await assertPublicHost(startUrl.hostname)
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }

    // Counts against the rate limit from here on — a mistyped URL above
    // doesn't cost the visitor one of their 5 free audits this hour.
    await sql`INSERT INTO audit_requests (id, ip) VALUES (${randomUUID()}, ${ip})`

    const origin = startUrl.origin

    // Homepage fetch, timed for a real (not invented) load-time figure.
    const t0 = Date.now()
    let homeRes: Response
    try {
      homeRes = await fetchWithTimeout(origin)
    } catch {
      return NextResponse.json({ error: "Couldn't reach that site — check the URL and try again." }, { status: 400 })
    }
    const homepageLoadMs = Date.now() - t0
    if (!homeRes.ok) {
      return NextResponse.json({ error: `That site returned an error (HTTP ${homeRes.status})` }, { status: 400 })
    }
    const homeHtml = await homeRes.text()
    const $home = cheerio.load(homeHtml)

    const generator = $home('meta[name="generator"]').attr('content') ?? ''
    const isWordPress = /wordpress/i.test(generator) || /\/wp-content\/|\/wp-includes\//i.test(homeHtml)

    const pluginSlugs = new Set<string>()
    const pluginRe = /\/wp-content\/plugins\/([a-z0-9-]+)\//gi
    let m: RegExpExecArray | null
    while ((m = pluginRe.exec(homeHtml)) && pluginSlugs.size < 12) pluginSlugs.add(m[1])

    // Prefer an authoritative sitemap count; fall back to a shallow
    // same-origin link crawl (a lower bound, since it only sees what's
    // actually linked) if no sitemap is found or parseable.
    let pagesFound = await countFromSitemap(origin)
    let pagesFoundIsExact = pagesFound !== null

    if (pagesFound === null) {
      const visited = new Set<string>([startUrl.pathname])
      const queue: string[] = []
      $home('a[href]').each((_, el) => {
        const href = $home(el).attr('href')
        if (!href) return
        try {
          const abs = new URL(href, origin)
          if (abs.origin === origin && !visited.has(abs.pathname)) queue.push(abs.pathname)
        } catch {}
      })
      let count = 1 // homepage itself
      while (queue.length > 0 && count < MAX_PAGES) {
        const path = queue.shift()!
        if (visited.has(path)) continue
        visited.add(path)
        count++
        try {
          const res = await fetchWithTimeout(new URL(path, origin).toString())
          if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/html')) continue
          const html = await res.text()
          const $ = cheerio.load(html)
          $('a[href]').each((_, el) => {
            const href = $(el).attr('href')
            if (!href) return
            try {
              const abs = new URL(href, origin)
              if (abs.origin === origin && !visited.has(abs.pathname) && queue.length < MAX_PAGES * 2) queue.push(abs.pathname)
            } catch {}
          })
        } catch {}
      }
      pagesFound = count
      pagesFoundIsExact = queue.length === 0
    } else if (pagesFound > MAX_SITEMAP_URLS) {
      pagesFound = MAX_SITEMAP_URLS
      pagesFoundIsExact = false
    }

    return NextResponse.json({
      url: origin,
      isWordPress,
      pagesFound,
      pagesFoundIsExact,
      homepageLoadMs,
      pluginsDetected: Array.from(pluginSlugs),
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
