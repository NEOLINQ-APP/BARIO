import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import * as cheerio from 'cheerio'
import { put } from '@vercel/blob'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuilderAccess, hasPaidPlan } from '@/lib/access'
import { maxSitesForPlan } from '@/lib/plans'
import { assertPublicHost } from '@/lib/ssrf'
import { errorResponse } from '@/lib/errors'

// Crawling up to MAX_PAGES pages, each with several image fetch+upload
// round-trips, comfortably exceeds a typical serverless default — this is a
// paid-tier-gated, user-initiated action a person is actively waiting on,
// not a hot-path request, so it's worth the larger budget Vercel allows.
export const maxDuration = 280

// Kept well inside maxDuration even in a worst-case run — image re-hosting
// is separately capped at MAX_IMAGES regardless of page count, but a page
// count much higher than this risks the *sequential page fetches alone*
// exceeding the time budget if several are slow. Stated explicitly in the
// UI (MigrateSitePanel) rather than silently capped with no disclosure.
const MAX_PAGES = 40
const MAX_IMAGES = 40
const FETCH_TIMEOUT_MS = 10_000
const MAX_PAGE_SIZE = 3 * 1024 * 1024 // 3MB per page — bounds Postgres row size
const MAX_IMAGE_SIZE = 8 * 1024 * 1024
const SKIP_EXTENSIONS = /\.(pdf|zip|docx?|xlsx?|jpg|jpeg|png|gif|svg|webp|mp4|mp3|css|js)$/i

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; BarioMigrator/1.0; +https://bario.ca)' },
    })
  } finally {
    clearTimeout(t)
  }
}

// BARIO's own page-routing convention (see lib/renderSite.ts / site_pages):
// the home page is slug "", everything else is a lowercase path with no
// leading/trailing slash. index.html/index.php collapse to the home slug.
function slugFromPath(pathname: string): string {
  const clean = pathname.replace(/^\/+|\/+$/g, '').toLowerCase()
  if (!clean || clean === 'index.html' || clean === 'index.php') return ''
  return clean.replace(/\.(html?|php)$/i, '')
}

const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const RESERVED_SUBDOMAINS = new Set(['www', 'admin', 'hub', 'mail'])

function subdomainSegment(hostname: string): string {
  const base = hostname.replace(/^www\./, '').split('.')[0].toLowerCase().replace(/[^a-z0-9-]/g, '')
  return base || 'site'
}

// The whole point of the feature is "push a button, see it live" — a
// migrated site nobody can reach at a URL yet doesn't deliver that, so this
// assigns a subdomain automatically rather than leaving it as a manual
// follow-up step. Only touches sites that don't already have one.
async function ensureSubdomain(sql: any, siteId: string, hostname: string): Promise<string> {
  const rows = (await sql`SELECT subdomain FROM sites WHERE id = ${siteId}`) as unknown as { subdomain: string | null }[]
  if (rows[0]?.subdomain) return rows[0].subdomain

  let base = subdomainSegment(hostname)
  if (!SUBDOMAIN_RE.test(base) || RESERVED_SUBDOMAINS.has(base)) base = `site-${randomUUID().slice(0, 8)}`

  let candidate = base
  let n = 2
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const taken = (await sql`SELECT id FROM sites WHERE subdomain = ${candidate} AND id != ${siteId}`) as unknown as { id: string }[]
    if (!taken[0]) break
    candidate = `${base}-${n}`
    n++
  }
  await sql`UPDATE sites SET subdomain = ${candidate} WHERE id = ${siteId}`
  return candidate
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasBuilderAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email first' }, { status: 403 })
    }

    // The whole feature is paid-tier only — checked before anything else,
    // including URL validation, so a free-tier user gets a clean upgrade
    // prompt rather than a validation error that implies the feature would
    // otherwise work for them.
    if (!hasPaidPlan(user)) {
      return NextResponse.json(
        {
          error: 'upgrade_required',
          message: 'Migrating an existing website is a paid-tier feature. Upgrade your plan to bring your site over to Bario.',
        },
        { status: 402 }
      )
    }

    const { url: rawUrl, siteId: requestedSiteId } = await req.json().catch(() => ({}))
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

    const origin = startUrl.origin

    // Resolve target site: an explicit siteId the user already owns, or
    // create a fresh one (subject to the plan's site-count limit, same as
    // manually clicking "New site").
    let siteId: string | null = typeof requestedSiteId === 'string' ? requestedSiteId : null
    if (siteId) {
      const rows = (await sql`SELECT id FROM sites WHERE id = ${siteId} AND user_id = ${session.userId}`) as unknown as { id: string }[]
      if (!rows[0]) return NextResponse.json({ error: 'Site not found' }, { status: 404 })
    } else {
      const countRows = (await sql`SELECT count(*)::int AS count FROM sites WHERE user_id = ${session.userId}`) as unknown as { count: number }[]
      const limit = maxSitesForPlan(user.plan, user.is_admin)
      if (countRows[0].count >= limit) {
        return NextResponse.json(
          { error: `Your plan allows ${limit === Infinity ? 'unlimited' : limit} site${limit === 1 ? '' : 's'} — upgrade or remove one to migrate a new site.` },
          { status: 403 }
        )
      }
      siteId = randomUUID()
      await sql`INSERT INTO sites (id, user_id, name, content_mode) VALUES (${siteId}, ${session.userId}, ${startUrl.hostname}, 'template')`
    }

    // --- Crawl ---
    const visited = new Set<string>()
    const queue: string[] = [startUrl.pathname]
    const pages: { slug: string; name: string; html: string; isHome: boolean }[] = []
    const imageCache = new Map<string, string>()
    let imagesRehosted = 0
    const externalAssetDomains = new Set<string>()
    const failedPages: string[] = []

    const rehostImage = async (imgUrl: string): Promise<string | null> => {
      if (imageCache.has(imgUrl)) return imageCache.get(imgUrl)!
      if (imagesRehosted >= MAX_IMAGES) return null
      try {
        const res = await fetchWithTimeout(imgUrl, 8000)
        if (!res.ok) return null
        const contentType = res.headers.get('content-type') || ''
        if (!contentType.startsWith('image/')) return null
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.byteLength > MAX_IMAGE_SIZE) return null
        const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg'
        const blob = await put(`migrated/${randomUUID()}.${ext}`, buf, { access: 'public', contentType })
        imagesRehosted++
        imageCache.set(imgUrl, blob.url)
        return blob.url
      } catch {
        return null
      }
    }

    while (queue.length > 0 && pages.length < MAX_PAGES) {
      const path = queue.shift()!
      const normPath = path.split('#')[0] || '/'
      if (visited.has(normPath)) continue
      visited.add(normPath)

      const pageUrl = new URL(normPath, origin).toString()
      let res: Response
      try {
        res = await fetchWithTimeout(pageUrl)
      } catch {
        failedPages.push(pageUrl)
        continue
      }
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/html')) {
        failedPages.push(pageUrl)
        continue
      }
      const buf = await res.arrayBuffer()
      if (buf.byteLength > MAX_PAGE_SIZE) {
        failedPages.push(pageUrl)
        continue
      }
      const html = Buffer.from(buf).toString('utf-8')
      const $ = cheerio.load(html)
      const title = $('title').first().text().trim() || startUrl.hostname

      // Internal links become new BARIO-relative page paths (and feed the
      // crawl queue); links leaving the site (socials, external refs) pass
      // through untouched.
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href')
        if (!href) return
        try {
          const abs = new URL(href, pageUrl)
          if (abs.origin !== origin) return
          if (!SKIP_EXTENSIONS.test(abs.pathname)) {
            const p = abs.pathname || '/'
            if (!visited.has(p) && pages.length + queue.length < MAX_PAGES * 2) queue.push(p)
          }
          const slug = slugFromPath(abs.pathname)
          $(el).attr('href', slug ? `/${slug}` : '/')
        } catch {}
      })

      // Images are the one asset type actually taken over — fetched and
      // re-hosted on Bario's own storage, not left dependent on the old site.
      for (const el of $('img[src]').toArray()) {
        const src = $(el).attr('src')
        if (!src) continue
        try {
          const abs = new URL(src, pageUrl).toString()
          const hosted = await rehostImage(abs)
          $(el).attr('src', hosted ?? abs)
        } catch {}
      }
      // Responsive srcset would need the same per-size treatment as src;
      // dropping it just makes the browser fall back to the plain src
      // above rather than risk a stale/broken relative URL.
      $('img[srcset]').removeAttr('srcset')

      // Stylesheets/scripts are NOT re-hosted in this version — resolved to
      // absolute URLs (against the original site for same-origin ones) so
      // they keep working once served from bario.ca instead of 404ing on a
      // relative path that no longer means anything on the new domain.
      // This means visual styling still depends on the original site
      // staying online; cross-domain ones (CDNs, Google Fonts, etc.) are
      // recorded so the caller can be told plainly what's still external.
      $('link[href], script[src]').each((_, el) => {
        const attr = $(el).is('script') ? 'src' : 'href'
        const val = $(el).attr(attr)
        if (!val) return
        try {
          const abs = new URL(val, pageUrl)
          $(el).attr(attr, abs.toString())
          if (abs.origin !== origin) externalAssetDomains.add(abs.origin)
        } catch {}
      })

      const slug = slugFromPath(new URL(pageUrl).pathname)
      const isHome = normPath === '/' || normPath === startUrl.pathname
      pages.push({ slug, name: title, html: $.html(), isHome })
    }

    if (pages.length === 0) {
      return NextResponse.json({ error: "Couldn't reach that site, or it didn't return any readable pages." }, { status: 400 })
    }
    // Whether the crawl actually ran out of pages, or hit MAX_PAGES with
    // more still queued — the caller shouldn't be told "fully migrated"
    // when there was more the crawler didn't get to.
    const pagesCapped = pages.length >= MAX_PAGES && queue.length > 0
    if (!pages.some((p) => p.isHome)) pages[0].isHome = true

    await sql`UPDATE site_pages SET is_home = false WHERE site_id = ${siteId}`
    for (const page of pages) {
      const id = randomUUID()
      await sql`
        INSERT INTO site_pages (id, site_id, slug, name, raw_html, is_home)
        VALUES (${id}, ${siteId}, ${page.slug}, ${page.name}, ${page.html}, ${page.isHome})
        ON CONFLICT (site_id, slug) DO UPDATE SET
          name = EXCLUDED.name, raw_html = EXCLUDED.raw_html, is_home = EXCLUDED.is_home, updated_at = now()
      `
    }

    const subdomain = await ensureSubdomain(sql, siteId, startUrl.hostname)
    await sql`UPDATE sites SET is_published = true, content_mode = 'template', updated_at = now() WHERE id = ${siteId}`

    return NextResponse.json({
      ok: true,
      siteId,
      subdomain,
      url: `https://${subdomain}.bario.ca`,
      pagesImported: pages.length,
      pagesCapped,
      imagesRehosted,
      failedPages,
      externalAssetDomains: Array.from(externalAssetDomains),
      pages: pages.map((p) => ({ slug: p.slug, name: p.name, isHome: p.isHome })),
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
