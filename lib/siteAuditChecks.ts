import * as cheerio from 'cheerio'
import { assertPublicHost } from '@/lib/ssrf'

const FETCH_TIMEOUT_MS = 8000
const MAX_PAGES = 20
const MAX_SITEMAP_URLS = 60

// Placeholder, adjustable — same "flag it, don't pretend it's final"
// convention as lib/credits.ts's own STUDIO_CREDIT_COSTS comment. Lives
// here (not in the deep-dive route file) so both the API route and the
// page component can import it without importing from a route.ts file,
// which Next.js's App Router doesn't support beyond its reserved exports.
export const DEEP_AUDIT_CREDIT_COST = 5

export async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
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

// Tries the two conventional sitemap locations for an authoritative page
// count straight from the site's own index — usually far more accurate
// than counting crawled links, which undercounts anything not reachable
// from the nav. Handles one level of sitemap-index nesting. Also reports
// whether a sitemap was found at all, independent of whether a usable
// count came out of it — used as its own free-tier finding.
async function countFromSitemap(origin: string): Promise<{ count: number | null; sitemapFound: boolean }> {
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
        if (total > 0) return { count: total, sitemapFound: true }
      }
      const directCount = $('urlset url loc').length
      if (directCount > 0) return { count: directCount, sitemapFound: true }
      return { count: null, sitemapFound: true }
    } catch {}
  }
  return { count: null, sitemapFound: false }
}

export type AuditFindings = {
  url: string
  isWordPress: boolean
  pluginsDetected: string[]
  pagesFound: number
  pagesFoundIsExact: boolean
  seo: {
    title: { present: boolean; length: number; text: string; issue: 'missing' | 'too_short' | 'too_long' | null }
    metaDescription: { present: boolean; length: number; text: string; issue: 'missing' | 'too_short' | 'too_long' | null }
    h1: { count: number; text: string[]; issue: 'missing' | 'multiple' | null }
    headingOrderIssues: boolean
    altText: { totalImages: number; missingAlt: number; coveragePct: number }
    viewportPresent: boolean
    https: boolean
    canonicalPresent: boolean
    openGraphPresent: boolean
    sitemapPresent: boolean
    robotsTxtPresent: boolean
    isBarioHosted: boolean
  }
  performance: {
    homepageLoadMs: number
    totalPageSizeBytes: number
    imageCount: number
    inlineStyleOrScriptBytes: number
  }
}

// The main gated free-tier audit — one homepage fetch, one small
// sitemap.xml fetch (reused for both the page-count and sitemap-presence
// findings), one small robots.txt fetch, everything else read from the
// already-parsed DOM. `sql` is optional — when passed, also checks
// whether the URL matches one of Bario's own hosted sites (subdomain or
// verified custom domain) so a missing sitemap/robots.txt on our OWN
// customers' sites doesn't get framed as alarmingly as a prospect's.
export async function runFreeAudit(startUrl: URL, sql?: any): Promise<AuditFindings> {
  await assertPublicHost(startUrl.hostname)
  const origin = startUrl.origin

  const t0 = Date.now()
  const homeRes = await fetchWithTimeout(origin)
  const homepageLoadMs = Date.now() - t0
  if (!homeRes.ok) throw new Error(`That site returned an error (HTTP ${homeRes.status})`)
  const homeHtml = await homeRes.text()
  const $home = cheerio.load(homeHtml)

  const generator = $home('meta[name="generator"]').attr('content') ?? ''
  const isWordPress = /wordpress/i.test(generator) || /\/wp-content\/|\/wp-includes\//i.test(homeHtml)

  const pluginSlugs = new Set<string>()
  const pluginRe = /\/wp-content\/plugins\/([a-z0-9-]+)\//gi
  let m: RegExpExecArray | null
  while ((m = pluginRe.exec(homeHtml)) && pluginSlugs.size < 12) pluginSlugs.add(m[1])

  const { count: sitemapCount, sitemapFound } = await countFromSitemap(origin)
  let pagesFound = sitemapCount
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
    let count = 1
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

  // --- SEO / technical checks ---
  const titleText = $home('title').first().text().trim()
  const titleIssue = !titleText ? 'missing' : titleText.length < 15 ? 'too_short' : titleText.length > 60 ? 'too_long' : null
  const metaDescText = ($home('meta[name="description"]').attr('content') ?? '').trim()
  const metaDescIssue = !metaDescText ? 'missing' : metaDescText.length < 50 ? 'too_short' : metaDescText.length > 160 ? 'too_long' : null

  const h1Texts = $home('h1').map((_, el) => $home(el).text().trim()).get()
  const h1Issue = h1Texts.length === 0 ? 'missing' : h1Texts.length > 1 ? 'multiple' : null

  let headingOrderIssues = false
  let seenMaxLevel = 0
  $home('h1,h2,h3,h4,h5,h6').each((_, el) => {
    const level = Number((el as any).tagName?.slice(1) ?? el.name?.slice(1))
    if (Number.isFinite(level)) {
      if (level > seenMaxLevel + 1) headingOrderIssues = true
      seenMaxLevel = Math.max(seenMaxLevel, level)
    }
  })

  const imgs = $home('img')
  const totalImages = imgs.length
  let missingAlt = 0
  imgs.each((_, el) => { if (!$home(el).attr('alt')) missingAlt++ })
  const coveragePct = totalImages > 0 ? Math.round(((totalImages - missingAlt) / totalImages) * 100) : 100

  const viewportPresent = $home('meta[name="viewport"]').length > 0
  const canonicalPresent = $home('link[rel="canonical"]').length > 0
  const openGraphPresent = $home('meta[property^="og:"]').length > 0

  let robotsTxtPresent = false
  try {
    const robotsRes = await fetchWithTimeout(origin + '/robots.txt')
    robotsTxtPresent = robotsRes.ok
  } catch {}

  let isBarioHosted = /\.bario\.ca$/i.test(startUrl.hostname)
  if (!isBarioHosted && sql) {
    try {
      const rows = (await sql`SELECT 1 FROM sites WHERE custom_domain = ${startUrl.hostname} AND domain_status = 'verified' LIMIT 1`) as unknown[]
      isBarioHosted = rows.length > 0
    } catch {}
  }

  const totalPageSizeBytes = Buffer.byteLength(homeHtml, 'utf8')
  let inlineStyleOrScriptBytes = 0
  $home('style').each((_, el) => { inlineStyleOrScriptBytes += ($home(el).html() ?? '').length })
  $home('script:not([src])').each((_, el) => { inlineStyleOrScriptBytes += ($home(el).html() ?? '').length })

  return {
    url: origin,
    isWordPress,
    pluginsDetected: Array.from(pluginSlugs),
    pagesFound,
    pagesFoundIsExact,
    seo: {
      title: { present: !!titleText, length: titleText.length, text: titleText, issue: titleIssue },
      metaDescription: { present: !!metaDescText, length: metaDescText.length, text: metaDescText, issue: metaDescIssue },
      h1: { count: h1Texts.length, text: h1Texts.slice(0, 5), issue: h1Issue },
      headingOrderIssues,
      altText: { totalImages, missingAlt, coveragePct },
      viewportPresent,
      https: startUrl.protocol === 'https:',
      canonicalPresent,
      openGraphPresent,
      sitemapPresent: sitemapFound,
      robotsTxtPresent,
      isBarioHosted,
    },
    performance: {
      homepageLoadMs,
      totalPageSizeBytes,
      imageCount: totalImages,
      inlineStyleOrScriptBytes,
    },
  }
}

export type ContentDigest = {
  title: string
  metaDescription: string
  headings: { level: number; text: string }[]
  visibleText: string
  imageAltSamples: string[]
  ogTags: Record<string, string>
}

// Bounded content digest for the paid AI deep-dive — deliberately NOT raw
// HTML (wasteful and noisy for an LLM asked to write a report, not parse
// markup) — just the signal a report actually needs.
export function extractContentDigest(html: string): ContentDigest {
  const $ = cheerio.load(html)
  const title = $('title').first().text().trim()
  const metaDescription = ($('meta[name="description"]').attr('content') ?? '').trim()

  const headings: { level: number; text: string }[] = []
  $('h1,h2,h3').each((_, el) => {
    if (headings.length >= 40) return
    const level = Number((el as any).tagName?.slice(1) ?? el.name?.slice(1))
    const text = $(el).text().trim()
    if (Number.isFinite(level) && text) headings.push({ level, text })
  })

  const imageAltSamples: string[] = []
  $('img').each((_, el) => {
    if (imageAltSamples.length >= 10) return
    imageAltSamples.push($(el).attr('alt')?.trim() || '[missing]')
  })

  const ogTags: Record<string, string> = {}
  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr('property')
    const content = $(el).attr('content')
    if (prop && content) ogTags[prop] = content
  })

  $('script,style,noscript').remove()
  const visibleText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 6000)

  return { title, metaDescription, headings, visibleText, imageAltSamples, ogTags }
}
