import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type WpSite, type WpHostingNode } from '@/lib/db'
import { provisionCloudflareZoneForTarget } from '@/lib/domainConnect'
import { errorResponse } from '@/lib/errors'

// Seeds a Cloudflare zone (A record pointed at this site's node IP) for a
// domain the customer wants to use instead of their <slug>.wp.bario.ca
// subdomain. Doesn't touch Caddy or flip domain_status yet — that only
// happens once verify-domain confirms DNS is actually live (same
// explicit-verify-required convention as sites.domain_status elsewhere in
// this project).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { domain } = await req.json().catch(() => ({}))
    if (typeof domain !== 'string' || !domain.trim()) {
      return NextResponse.json({ error: 'A domain is required' }, { status: 400 })
    }
    const cleanDomain = domain.trim().toLowerCase()

    const sql = await db()
    const rows = (await sql`SELECT * FROM wp_sites WHERE id = ${params.id} AND user_id = ${session.userId}`) as unknown as WpSite[]
    const site = rows[0]
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })
    if (site.status !== 'active' || !site.node_id) return NextResponse.json({ error: 'Site is not active yet' }, { status: 400 })

    const nodeRows = (await sql`SELECT ipv4 FROM wp_hosting_nodes WHERE id = ${site.node_id}`) as unknown as WpHostingNode[]
    const node = nodeRows[0]
    if (!node) return NextResponse.json({ error: 'Node not found' }, { status: 500 })

    const zone = await provisionCloudflareZoneForTarget(cleanDomain, node.ipv4)

    await sql`UPDATE wp_sites SET custom_domain = ${cleanDomain}, domain_status = 'pending', updated_at = now() WHERE id = ${params.id}`

    return NextResponse.json({
      ok: true,
      domain: cleanDomain,
      targetIp: node.ipv4,
      nameservers: zone?.nameservers ?? null,
      message: zone
        ? `Point ${cleanDomain}'s nameservers at the ones returned, or just add an A record to ${node.ipv4} at your current DNS provider — then verify.`
        : `Add an A record for ${cleanDomain} pointing at ${node.ipv4} at your DNS provider, then verify.`,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
