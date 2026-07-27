import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Multi-page sibling of /api/admin/users/import-html. That route overwrites
// a site's single sites.raw_html column (one page per site); this one writes
// into the additive site_pages table instead, keyed by (siteId, slug) — for
// bringing over a multi-page static export (e.g. a Simply Static WordPress
// export with real /about, /contact, etc. pages) without collapsing it into
// one page. Unlike import-html, siteId is REQUIRED here rather than
// auto-resolved: a multi-page import always targets a specific site the
// caller already created via /api/admin/users/create-site, since
// resolveSiteId()'s "most recently touched site" default would be unsafe
// once a site is expected to accumulate several page rows one call at a time.
const MAX_SIZE = 5 * 1024 * 1024 // matches import-html — bounds Postgres row size

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  const title = match?.[1]?.trim()
  return title || 'Page'
}

function normalizeSlug(raw: string): string {
  return raw
    .trim()
    .replace(/^\/+|\/+$/g, '') // strip leading/trailing slashes
    .toLowerCase()
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const form = await req.formData()
    const email = form.get('email')
    const siteId = form.get('siteId')
    const slugRaw = form.get('slug')
    const isHomeRaw = form.get('isHome')
    const file = form.get('file')

    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    if (typeof siteId !== 'string' || !siteId.trim()) {
      return NextResponse.json({ error: 'siteId is required (create the site first via /api/admin/users/create-site)' }, { status: 400 })
    }
    if (typeof slugRaw !== 'string') {
      return NextResponse.json({ error: 'slug is required (use an empty string for the homepage)' }, { status: 400 })
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!/\.(html?|HTML?)$/.test(file.name)) {
      return NextResponse.json({ error: 'File must be an .html file' }, { status: 400 })
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File must be under 5MB' }, { status: 400 })
    }

    const html = await file.text()
    if (!/<html[\s>]|<!doctype html/i.test(html)) {
      return NextResponse.json({ error: "That doesn't look like a valid HTML file" }, { status: 400 })
    }

    const userRows = (await sql`SELECT id FROM users WHERE email = ${email.trim().toLowerCase()}`) as unknown as { id: string }[]
    const targetUser = userRows[0]
    if (!targetUser) {
      await logAdminAction(sql, { action: 'import-page', targetEmail: email, result: 'error', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
      return NextResponse.json({ error: `No account found for ${email} — they need to sign up first` }, { status: 404 })
    }

    const siteRows = (await sql`SELECT id FROM sites WHERE id = ${siteId} AND user_id = ${targetUser.id}`) as unknown as { id: string }[]
    if (!siteRows[0]) {
      await logAdminAction(sql, { action: 'import-page', targetEmail: email, params: { siteId }, result: 'error', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
      return NextResponse.json({ error: `Site ${siteId} not found on ${email}'s account` }, { status: 404 })
    }

    const slug = normalizeSlug(slugRaw)
    const isHome = isHomeRaw === 'true' || isHomeRaw === '1' || slug === ''
    const name = extractTitle(html)

    // Only one page per site can be is_home — clear any existing flag before
    // setting a new one, rather than trusting the caller to have done so.
    if (isHome) {
      await sql`UPDATE site_pages SET is_home = false WHERE site_id = ${siteId}`
    }

    const id = randomUUID()
    await sql`
      INSERT INTO site_pages (id, site_id, slug, name, raw_html, is_home)
      VALUES (${id}, ${siteId}, ${slug}, ${name}, ${html}, ${isHome})
      ON CONFLICT (site_id, slug) DO UPDATE SET
        name = EXCLUDED.name, raw_html = EXCLUDED.raw_html, is_home = EXCLUDED.is_home, updated_at = now()
    `

    // Matches import-html's "publishes immediately" convention — a page
    // import is only useful once the site is actually live.
    await sql`UPDATE sites SET is_published = true, updated_at = now() WHERE id = ${siteId}`

    await logAdminAction(sql, { action: 'import-page', targetEmail: email, params: { siteId, slug, isHome, name }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true, siteId, slug, isHome })
  } catch (err: any) {
    return errorResponse(err)
  }
}
