import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasPaidPlan } from '@/lib/access'
import { addDomainToVercel, removeDomainFromVercel, wwwSibling } from '@/lib/vercel'
import { createZone, getZoneByDomain, deleteZone, createDnsRecord } from '@/lib/cloudflare'
import { errorResponse } from '@/lib/errors'

// Provisions a Cloudflare zone for the domain (or reuses one already sitting in
// our account) and seeds the A/CNAME records that point it at Vercel, so once
// the customer updates their nameservers the site just works with no manual
// DNS entry required. Non-fatal on failure — callers fall back to the older
// manual A/CNAME-at-current-registrar flow if Cloudflare isn't available.
async function provisionCloudflareZone(domain: string): Promise<{ zoneId: string; nameservers: string[] } | null> {
  try {
    const zone = (await getZoneByDomain(domain)) ?? (await createZone(domain))
    await Promise.all([
      createDnsRecord(zone.id, { type: 'A', name: '@', content: '76.76.21.21', proxied: false }).catch(() => {}),
      createDnsRecord(zone.id, { type: 'CNAME', name: 'www', content: 'cname.vercel-dns.com', proxied: false }).catch(() => {}),
    ])
    return { zoneId: zone.id, nameservers: zone.name_servers ?? [] }
  } catch {
    return null
  }
}

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

    const { domain } = await req.json()
    const clean = String(domain ?? '').trim().toLowerCase()
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(clean)) {
      return NextResponse.json({ error: 'Enter a valid domain, e.g. myrestaurant.com' }, { status: 400 })
    }

    const rows = (await sql`SELECT id, custom_domain, cloudflare_zone_id FROM sites WHERE user_id = ${session.userId} LIMIT 1`) as unknown as {
      id: string
      custom_domain: string | null
      cloudflare_zone_id: string | null
    }[]
    const site = rows[0]
    if (!site) return NextResponse.json({ error: 'Save your site before connecting a domain' }, { status: 400 })

    if (site.custom_domain === clean) {
      return NextResponse.json({ error: 'That domain is already connected to this site' }, { status: 409 })
    }

    const existing = (await sql`SELECT id FROM sites WHERE custom_domain = ${clean} AND id != ${site.id}`) as unknown as { id: string }[]
    if (existing[0]) {
      return NextResponse.json({ error: 'That domain is already connected to another site' }, { status: 409 })
    }

    if (site.custom_domain) {
      try {
        await removeDomainFromVercel(site.custom_domain)
        const oldWww = wwwSibling(site.custom_domain)
        if (oldWww) await removeDomainFromVercel(oldWww)
      } catch {
        // Non-fatal: proceed with connecting the new domain even if the old
        // one couldn't be released (e.g. it was already removed manually).
      }
      if (site.cloudflare_zone_id) {
        await deleteZone(site.cloudflare_zone_id).catch(() => {})
      }
    }

    const vercelResult = await addDomainToVercel(clean)

    const www = wwwSibling(clean)
    if (www) {
      try {
        await addDomainToVercel(www)
      } catch {
        // Non-fatal: the apex domain is what we track verification against.
      }
    }

    const zone = await provisionCloudflareZone(clean)

    await sql`
      UPDATE sites
      SET custom_domain = ${clean},
          domain_status = 'pending',
          cloudflare_zone_id = ${zone?.zoneId ?? null},
          nameservers = ${zone ? zone.nameservers.join(',') : null}
      WHERE id = ${site.id}
    `

    return NextResponse.json({
      ok: true,
      verified: vercelResult.verified ?? false,
      nameservers: zone?.nameservers ?? null,
      instructions: {
        a: { type: 'A', name: '@', value: '76.76.21.21' },
        cname: { type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com' },
      },
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function DELETE() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasPaidPlan(user)) {
      return NextResponse.json({ error: 'Upgrade to a paid plan to use this feature' }, { status: 403 })
    }

    const rows = (await sql`SELECT id, custom_domain, cloudflare_zone_id FROM sites WHERE user_id = ${session.userId} LIMIT 1`) as unknown as {
      id: string
      custom_domain: string | null
      cloudflare_zone_id: string | null
    }[]
    const site = rows[0]
    if (!site?.custom_domain) return NextResponse.json({ error: 'No custom domain connected' }, { status: 400 })

    await removeDomainFromVercel(site.custom_domain)
    const www = wwwSibling(site.custom_domain)
    if (www) {
      try {
        await removeDomainFromVercel(www)
      } catch {
        // Non-fatal cleanup — apex removal above is what matters.
      }
    }
    if (site.cloudflare_zone_id) {
      await deleteZone(site.cloudflare_zone_id).catch(() => {})
    }

    await sql`UPDATE sites SET custom_domain = NULL, domain_status = 'none', cloudflare_zone_id = NULL, nameservers = NULL WHERE id = ${site.id}`

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
