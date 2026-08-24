import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// TEMP one-time route: installs the YEG Transport raw-HTML site onto the
// agency account and sets its subdomain. Delete after use.
const OWNER_EMAIL = 'uniquegroup.org@gmail.com'
const SUBDOMAIN = 'yeg-transport'

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { html } = await req.json()
    if (typeof html !== 'string' || html.length < 100) {
      return NextResponse.json({ error: 'html body required' }, { status: 400 })
    }

    const userRows = (await sql`SELECT id FROM users WHERE email = ${OWNER_EMAIL}`) as unknown as { id: string }[]
    const owner = userRows[0]
    if (!owner) return NextResponse.json({ error: `No account for ${OWNER_EMAIL}` }, { status: 404 })

    const existing = (await sql`SELECT id FROM sites WHERE subdomain = ${SUBDOMAIN}`) as unknown as { id: string }[]

    let siteId: string
    if (existing[0]) {
      siteId = existing[0].id
      await sql`
        UPDATE sites SET
          name = 'YEG Transport', raw_html_backup = raw_html, raw_html = ${html},
          content_mode = 'template', updated_at = now()
        WHERE id = ${siteId}
      `
    } else {
      siteId = randomUUID()
      await sql`
        INSERT INTO sites (id, user_id, name, subdomain, raw_html, content_mode)
        VALUES (${siteId}, ${owner.id}, 'YEG Transport', ${SUBDOMAIN}, ${html}, 'template')
      `
    }

    return NextResponse.json({ ok: true, id: siteId, url: `https://${SUBDOMAIN}.bario.ca` })
  } catch (err: any) {
    return errorResponse(err)
  }
}
