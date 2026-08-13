import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { db } from '@/lib/db'
import { assertPublicHost } from '@/lib/ssrf'
import { fetchWithTimeout } from '@/lib/siteAuditChecks'
import { errorResponse } from '@/lib/errors'

// Shrunk 2026-08-13 — the real, useful audit (page count, load time,
// SEO/technical checks, AI deep-dive) now lives behind a real account at
// /api/site-audit + /api/site-audit/deep. This route stays public only as
// a zero-friction, shareable "is this WordPress?" teaser widget — real
// value now requires signing up, per the product decision to stop giving
// away the substantive checks with no account at all. Tightened rate
// limit accordingly (was 5/hour when this was the whole feature).
export const maxDuration = 20

const RATE_LIMIT_PER_HOUR = 3

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

    const sql = await db()
    const recentRows = (await sql`
      SELECT count(*)::int AS count FROM audit_requests WHERE ip = ${ip} AND created_at > now() - interval '1 hour'
    `) as unknown as { count: number }[]
    if (recentRows[0].count >= RATE_LIMIT_PER_HOUR) {
      return NextResponse.json({ error: "You've hit the free preview limit for now — try again in a bit, or sign up for the full audit." }, { status: 429 })
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

    await sql`INSERT INTO audit_requests (id, ip) VALUES (${randomUUID()}, ${ip})`

    let homeRes: Response
    try {
      homeRes = await fetchWithTimeout(startUrl.origin)
    } catch {
      return NextResponse.json({ error: "Couldn't reach that site — check the URL and try again." }, { status: 400 })
    }
    if (!homeRes.ok) {
      return NextResponse.json({ error: `That site returned an error (HTTP ${homeRes.status})` }, { status: 400 })
    }
    const homeHtml = await homeRes.text()
    const generator = homeHtml.match(/<meta[^>]*name=["']generator["'][^>]*content=["']([^"']*)["']/i)?.[1] ?? ''
    const isWordPress = /wordpress/i.test(generator) || /\/wp-content\/|\/wp-includes\//i.test(homeHtml)

    return NextResponse.json({ url: startUrl.origin, isWordPress })
  } catch (err: any) {
    return errorResponse(err)
  }
}
