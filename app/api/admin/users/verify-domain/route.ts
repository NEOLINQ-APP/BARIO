import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getDomainStatus, getDomainConfig } from '@/lib/vercel'
import { getZone } from '@/lib/cloudflare'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Admin equivalent of /api/sites/domain/verify — that route is session +
// paid-plan gated (an owner re-checking their own domain from the
// dashboard), which doesn't help when the admin needs to force a
// verification check on a comped/admin-managed account without logging in
// as them. Same underlying Vercel/Cloudflare checks, just keyed by siteId
// instead of the caller's session.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { siteId } = await req.json()
    if (typeof siteId !== 'string' || !siteId.trim()) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 })
    }

    const rows = (await sql`SELECT id, custom_domain, cloudflare_zone_id FROM sites WHERE id = ${siteId}`) as unknown as {
      id: string
      custom_domain: string | null
      cloudflare_zone_id: string | null
    }[]
    const site = rows[0]
    if (!site?.custom_domain) {
      return NextResponse.json({ error: 'That site has no custom domain connected' }, { status: 400 })
    }

    const [status, config, zone] = await Promise.all([
      getDomainStatus(site.custom_domain),
      getDomainConfig(site.custom_domain),
      site.cloudflare_zone_id ? getZone(site.cloudflare_zone_id).catch(() => null) : Promise.resolve(null),
    ])
    const reallyVerified = status.verified && !config.misconfigured
    if (reallyVerified) {
      await sql`UPDATE sites SET domain_status = 'verified' WHERE id = ${site.id}`
    }

    await logAdminAction(sql, {
      action: 'verify-domain',
      params: { siteId, domain: site.custom_domain, verified: reallyVerified },
      result: 'ok',
      triggeredBy: auth.user ? 'admin' : 'ai_autonomous',
    })

    return NextResponse.json({
      verified: reallyVerified,
      ownershipVerified: status.verified,
      misconfigured: config.misconfigured,
      verification: status.verification ?? [],
      zoneStatus: zone?.status ?? null,
      nameservers: zone?.name_servers ?? null,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
