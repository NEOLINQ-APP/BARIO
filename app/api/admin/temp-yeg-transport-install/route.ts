import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// TEMP one-time route (recreated for a content update, will be deleted
// after use): updates the YEG Transport raw-HTML site in place.
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

    const existing = (await sql`SELECT id FROM sites WHERE subdomain = ${SUBDOMAIN}`) as unknown as { id: string }[]
    if (!existing[0]) return NextResponse.json({ error: 'yeg-transport site not found' }, { status: 404 })

    await sql`
      UPDATE sites SET raw_html_backup = raw_html, raw_html = ${html}, updated_at = now()
      WHERE id = ${existing[0].id}
    `

    return NextResponse.json({ ok: true, id: existing[0].id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
