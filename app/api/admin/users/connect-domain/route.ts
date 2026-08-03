import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/admin'
import { resolveSiteId } from '@/lib/siteAccess'
import { addDomainToVercel, wwwSibling } from '@/lib/vercel'
import { createZone, getZoneByDomain, createDnsRecord } from '@/lib/cloudflare'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Admin equivalent of /api/sites/domain — connects a custom domain to an
// account's site on their behalf (e.g. a comped account with no card on
// file). If the account has no site yet, creates a blank one first so
// there's something to attach the domain to.
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
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { email, domain } = await req.json()
    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    const clean = String(domain ?? '').trim().toLowerCase()
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(clean)) {
      return NextResponse.json({ error: 'Enter a valid domain, e.g. myrestaurant.com' }, { status: 400 })
    }

    const userRows = (await sql`SELECT id FROM users WHERE email = ${email.trim().toLowerCase()}`) as unknown as { id: string }[]
    const targetUser = userRows[0]
    if (!targetUser) {
      await logAdminAction(sql, { action: 'connect-domain', targetEmail: email, params: { domain: clean }, result: 'error', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
      return NextResponse.json({ error: `No account found for ${email} — they need to sign up first` }, { status: 404 })
    }

    let siteId = await resolveSiteId(sql, targetUser.id, null)
    if (!siteId) {
      siteId = randomUUID()
      await sql`
        INSERT INTO sites (id, user_id, name)
        VALUES (${siteId}, ${targetUser.id}, ${clean})
      `
    }

    const existing = (await sql`SELECT id FROM sites WHERE custom_domain = ${clean} AND id != ${siteId}`) as unknown as { id: string }[]
    if (existing[0]) {
      return NextResponse.json({ error: 'That domain is already connected to another site' }, { status: 409 })
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
      WHERE id = ${siteId}
    `

    await logAdminAction(sql, { action: 'connect-domain', targetEmail: email, params: { domain: clean }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({
      ok: true,
      siteId,
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
