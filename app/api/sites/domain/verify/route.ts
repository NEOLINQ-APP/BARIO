import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasPaidPlan } from '@/lib/access'
import { getDomainStatus, getDomainConfig } from '@/lib/vercel'
import { getZone } from '@/lib/cloudflare'
import { resolveSiteId } from '@/lib/siteAccess'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasPaidPlan(user)) {
      return NextResponse.json({ error: 'Upgrade to a paid plan to use this feature' }, { status: 403 })
    }

    const { siteId: requestedSiteId } = await req.json().catch(() => ({}))
    const resolvedId = await resolveSiteId(sql, session.userId, requestedSiteId)
    if (!resolvedId) return NextResponse.json({ error: 'No custom domain connected yet' }, { status: 400 })
    const rows = (await sql`SELECT id, custom_domain, cloudflare_zone_id FROM sites WHERE id = ${resolvedId}`) as unknown as {
      id: string
      custom_domain: string | null
      cloudflare_zone_id: string | null
    }[]
    const site = rows[0]
    if (!site?.custom_domain) return NextResponse.json({ error: 'No custom domain connected yet' }, { status: 400 })

    const [status, config, zone] = await Promise.all([
      getDomainStatus(site.custom_domain),
      getDomainConfig(site.custom_domain),
      site.cloudflare_zone_id ? getZone(site.cloudflare_zone_id).catch(() => null) : Promise.resolve(null),
    ])
    const reallyVerified = status.verified && !config.misconfigured
    if (reallyVerified) {
      await sql`UPDATE sites SET domain_status = 'verified' WHERE id = ${site.id}`
    }

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
