import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasPaidPlan } from '@/lib/access'
import { getDnsRecord, updateDnsRecord, deleteDnsRecord } from '@/lib/cloudflare'
import { resolveSiteId } from '@/lib/siteAccess'
import { errorResponse } from '@/lib/errors'

function isManaged(domain: string, r: { type: string; name: string; content: string }): boolean {
  if (r.type === 'A' && r.name === domain && r.content === '76.76.21.21') return true
  if (r.type === 'CNAME' && r.name === `www.${domain}` && r.content === 'cname.vercel-dns.com') return true
  return false
}

async function loadSiteAndUser(userId: string, requestedSiteId?: string | null) {
  const sql = await db()
  const userRows = (await sql`SELECT * FROM users WHERE id = ${userId}`) as unknown as User[]
  const user = userRows[0]
  if (!user || !hasPaidPlan(user)) return { user: null, site: null }

  const siteId = await resolveSiteId(sql, userId, requestedSiteId)
  if (!siteId) return { user, site: null }
  const rows = (await sql`
    SELECT id, custom_domain, cloudflare_zone_id FROM sites WHERE id = ${siteId}
  `) as unknown as { id: string; custom_domain: string | null; cloudflare_zone_id: string | null }[]
  return { user, site: rows[0] ?? null }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const body = await req.json()
    const { user, site } = await loadSiteAndUser(session.userId, body.siteId)
    if (!user) return NextResponse.json({ error: 'Upgrade to a paid plan to use this feature' }, { status: 403 })
    if (!site?.custom_domain || !site.cloudflare_zone_id) {
      return NextResponse.json({ error: 'Connect a custom domain before managing DNS' }, { status: 400 })
    }

    const patch: Record<string, unknown> = {}
    if (body.content != null) patch.content = String(body.content).trim()
    if (body.priority != null) patch.priority = Number(body.priority)
    if (body.ttl != null) patch.ttl = Number(body.ttl)

    const record = await updateDnsRecord(site.cloudflare_zone_id, params.id, patch)
    return NextResponse.json({ ok: true, record: { ...record, managed: isManaged(site.custom_domain, record) } })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { siteId: requestedSiteId } = await req.json().catch(() => ({}))
    const { user, site } = await loadSiteAndUser(session.userId, requestedSiteId)
    if (!user) return NextResponse.json({ error: 'Upgrade to a paid plan to use this feature' }, { status: 403 })
    if (!site?.custom_domain || !site.cloudflare_zone_id) {
      return NextResponse.json({ error: 'Connect a custom domain before managing DNS' }, { status: 400 })
    }

    const existing = await getDnsRecord(site.cloudflare_zone_id, params.id)
    if (isManaged(site.custom_domain, existing)) {
      return NextResponse.json(
        { error: 'This record powers your BARIO site — disconnect the domain instead of deleting it directly.' },
        { status: 400 }
      )
    }

    await deleteDnsRecord(site.cloudflare_zone_id, params.id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
