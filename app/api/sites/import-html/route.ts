import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'
import { resolveSiteId } from '@/lib/siteAccess'
import { errorResponse } from '@/lib/errors'

const MAX_SIZE = 5 * 1024 * 1024 // 5MB — generous for a static site page, bounds Postgres row size

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  const title = match?.[1]?.trim()
  return title || 'My Website'
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasBuilderAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email to use the builder' }, { status: 403 })
    }

    const form = await req.formData()
    const requestedSiteId = form.get('siteId')
    const file = form.get('file')
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

    const name = extractTitle(html)
    const siteId = await resolveSiteId(sql, session.userId, typeof requestedSiteId === 'string' ? requestedSiteId : null)

    let finalId = siteId
    if (siteId) {
      await sql`
        UPDATE sites SET
          name = ${name}, raw_html = ${html}, content_mode = 'template', updated_at = now()
        WHERE id = ${siteId}
      `
    } else {
      finalId = randomUUID()
      await sql`
        INSERT INTO sites (id, user_id, name, raw_html, content_mode)
        VALUES (${finalId}, ${session.userId}, ${name}, ${html}, 'template')
      `
    }

    return NextResponse.json({ ok: true, id: finalId })
  } catch (err: any) {
    return errorResponse(err)
  }
}
