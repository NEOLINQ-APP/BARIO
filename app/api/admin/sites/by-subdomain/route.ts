import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// Same idea as sites/by-domain but for a *.bario.ca subdomain rather than a
// connected custom domain — that route only matches custom_domain, which a
// bario.ca-subdomain-only site never has set.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const subdomain = new URL(req.url).searchParams.get('subdomain')?.trim().toLowerCase()
    if (!subdomain) return NextResponse.json({ error: 'subdomain is required' }, { status: 400 })

    const siteRows = await sql`
      SELECT s.id AS site_id, s.name, s.subdomain, s.content_mode, s.is_published, s.updated_at, u.id AS user_id, u.email
      FROM sites s
      JOIN users u ON u.id = s.user_id
      WHERE s.subdomain = ${subdomain}
    `
    return NextResponse.json({ ok: true, sites: siteRows })
  } catch (err) {
    return errorResponse(err)
  }
}
