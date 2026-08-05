import { resolve4 } from 'node:dns/promises'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type VpsInstance } from '@/lib/db'
import { execOnWordPressVps } from '@/lib/wpVpsManage'
import { errorResponse } from '@/lib/errors'

// Strict hostname validation — this value is later interpolated into a
// shell command run over SSH (issue-cert.sh's $1), so anything beyond a
// real domain name must be rejected here, not sanitized after the fact.
const DOMAIN_RE = /^(?=.{1,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/

// Customer-facing "Issue HTTPS certificate" action for a 'wordpress'
// app_type VPS (Product A) — SSHes into the box (via Bario's management
// key, see lib/wpVpsManage.ts) to run issue-cert.sh, but only after
// confirming server-side that the domain's DNS actually resolves to this
// box's IP. Don't let a bare Certbot failure be the only signal here — the
// same "DNS correct ≠ live" gotcha has bitten real domain migrations on
// this project before.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { domain } = await req.json().catch(() => ({}))
    if (typeof domain !== 'string' || !DOMAIN_RE.test(domain.trim())) {
      return NextResponse.json({ error: 'Enter a valid domain name (e.g. example.com)' }, { status: 400 })
    }
    const cleanDomain = domain.trim().toLowerCase()

    const sql = await db()
    const rows = (await sql`
      SELECT * FROM vps_instances WHERE id = ${params.id} AND user_id = ${session.userId}
    `) as unknown as VpsInstance[]
    const order = rows[0]
    if (!order) return NextResponse.json({ error: 'Server not found' }, { status: 404 })
    if (order.app_type !== 'wordpress') return NextResponse.json({ error: 'This server was not set up with WordPress' }, { status: 400 })
    if (order.status !== 'active' || !order.primary_ipv4) {
      return NextResponse.json({ error: 'This server is not active yet' }, { status: 400 })
    }

    let resolvedIps: string[] = []
    try {
      resolvedIps = await resolve4(cleanDomain)
    } catch {
      return NextResponse.json({ error: `${cleanDomain} doesn't resolve to anything yet — point its A record at ${order.primary_ipv4} first, then try again.` }, { status: 400 })
    }
    if (!resolvedIps.includes(order.primary_ipv4)) {
      return NextResponse.json({
        error: `${cleanDomain} currently resolves to ${resolvedIps.join(', ') || 'nothing'}, not this server's IP (${order.primary_ipv4}). Update its A record and wait for DNS to propagate, then try again.`,
      }, { status: 400 })
    }

    const result = await execOnWordPressVps(order.primary_ipv4, `bash /root/wordpress/issue-cert.sh ${cleanDomain}`)
    if (result.code !== 0) {
      return NextResponse.json({ error: `Certificate issuance failed: ${result.stderr.trim().slice(-500) || result.stdout.trim().slice(-500) || 'unknown error'}` }, { status: 502 })
    }

    await sql`UPDATE vps_instances SET wp_domain = ${cleanDomain}, wp_cert_issued_at = now(), updated_at = now() WHERE id = ${params.id}`

    return NextResponse.json({ ok: true, domain: cleanDomain })
  } catch (err: any) {
    return errorResponse(err)
  }
}
