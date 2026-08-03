import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/admin'
import { resolveSiteId } from '@/lib/siteAccess'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Admin equivalent of /api/sites/import-html — imports a static HTML page
// onto an account's site on their behalf and publishes it immediately (no
// draft step), for bringing an existing external site onto Bario without
// the owner needing to use the builder UI themselves.
const MAX_SIZE = 5 * 1024 * 1024 // matches /api/sites/import-html — bounds Postgres row size

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  const title = match?.[1]?.trim()
  return title || 'My Website'
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const form = await req.formData()
    const email = form.get('email')
    const requestedSiteId = form.get('siteId')
    const file = form.get('file')

    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
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
      await logAdminAction(sql, { action: 'import-html', targetEmail: email, result: 'error', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
      return NextResponse.json({ error: `No account found for ${email} — they need to sign up first` }, { status: 404 })
    }

    const name = extractTitle(html)
    const siteId = await resolveSiteId(sql, targetUser.id, typeof requestedSiteId === 'string' ? requestedSiteId : null)

    let finalId = siteId
    if (siteId) {
      // Snapshot the outgoing content before overwriting it — feeds the
      // restore-site admin tool so a bad import/edit can be undone.
      await sql`
        UPDATE sites SET
          name = ${name}, raw_html_backup = raw_html, raw_html = ${html}, content_mode = 'template', is_published = true, updated_at = now()
        WHERE id = ${siteId}
      `
    } else {
      finalId = randomUUID()
      await sql`
        INSERT INTO sites (id, user_id, name, raw_html, content_mode, is_published)
        VALUES (${finalId}, ${targetUser.id}, ${name}, ${html}, 'template', true)
      `
    }

    await logAdminAction(sql, { action: 'import-html', targetEmail: email, params: { siteId: finalId, name }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true, id: finalId })
  } catch (err: any) {
    return errorResponse(err)
  }
}
