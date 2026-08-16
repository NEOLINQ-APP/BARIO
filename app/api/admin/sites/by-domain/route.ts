import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// Reverse lookup: given a domain, which account/site has it set as
// custom_domain (and is it actually verified, i.e. would Bario's own
// middleware serve it)? No equivalent existed — every other admin site
// route goes the other way (email -> sites).
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const domain = new URL(req.url).searchParams.get('domain')?.trim().toLowerCase()
    if (!domain) return NextResponse.json({ error: 'domain is required' }, { status: 400 })

    const siteRows = await sql`
      SELECT s.id AS site_id, s.name, s.custom_domain, s.domain_status, s.is_published, s.subdomain, s.updated_at, u.id AS user_id, u.email
      FROM sites s
      JOIN users u ON u.id = s.user_id
      WHERE s.custom_domain = ${domain}
    `
    const orderRows = await sql`
      SELECT o.id AS order_id, o.domain, o.status, o.environment, o.created_at, u.id AS user_id, u.email
      FROM domain_orders o
      JOIN users u ON u.id = o.user_id
      WHERE o.domain = ${domain}
    `
    return NextResponse.json({ ok: true, sites: siteRows, domainOrders: orderRows })
  } catch (err) {
    return errorResponse(err)
  }
}
