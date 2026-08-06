import { resolve4 } from 'node:dns/promises'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type WpSite, type WpHostingNode } from '@/lib/db'
import { setWpSharedCustomDomain } from '@/lib/wpSharedProvision'
import { errorResponse } from '@/lib/errors'

// Only flips domain_status to 'verified' (and only then tells the node
// agent to start accepting the domain) once DNS is confirmed actually
// pointing here — the same "DNS correct ≠ live" gotcha that's bitten real
// domain migrations on this project before applies just as much to a
// shared-hosting node as it does to Vercel.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const rows = (await sql`SELECT * FROM wp_sites WHERE id = ${params.id} AND user_id = ${session.userId}`) as unknown as WpSite[]
    const site = rows[0]
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })
    if (!site.custom_domain || !site.node_id) return NextResponse.json({ error: 'No custom domain pending for this site' }, { status: 400 })

    const nodeRows = (await sql`SELECT ipv4 FROM wp_hosting_nodes WHERE id = ${site.node_id}`) as unknown as WpHostingNode[]
    const node = nodeRows[0]
    if (!node) return NextResponse.json({ error: 'Node not found' }, { status: 500 })

    let resolvedIps: string[] = []
    try {
      resolvedIps = await resolve4(site.custom_domain)
    } catch {
      return NextResponse.json({ error: `${site.custom_domain} doesn't resolve to anything yet — check its DNS and try again once it propagates.` }, { status: 400 })
    }
    if (!resolvedIps.includes(node.ipv4)) {
      return NextResponse.json({
        error: `${site.custom_domain} currently resolves to ${resolvedIps.join(', ') || 'nothing'}, not this site's server (${node.ipv4}). Update its DNS and try again.`,
      }, { status: 400 })
    }

    await setWpSharedCustomDomain(sql, site.id, site.custom_domain)
    await sql`UPDATE wp_sites SET domain_status = 'verified', updated_at = now() WHERE id = ${params.id}`

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
