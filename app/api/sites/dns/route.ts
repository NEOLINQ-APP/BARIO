import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'
import { getZone, listDnsRecords, createDnsRecord, qualifyName } from '@/lib/cloudflare'
import { errorResponse } from '@/lib/errors'

const ALLOWED_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT']

function isManaged(domain: string, r: { type: string; name: string; content: string }): boolean {
  if (r.type === 'A' && r.name === domain && r.content === '76.76.21.21') return true
  if (r.type === 'CNAME' && r.name === `www.${domain}` && r.content === 'cname.vercel-dns.com') return true
  return false
}

async function loadSite(userId: string) {
  const sql = await db()
  const rows = (await sql`
    SELECT id, custom_domain, cloudflare_zone_id FROM sites WHERE user_id = ${userId} LIMIT 1
  `) as unknown as { id: string; custom_domain: string | null; cloudflare_zone_id: string | null }[]
  return rows[0] ?? null
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasBuilderAccess(user)) {
      return NextResponse.json({ error: 'An active subscription is required to use the builder' }, { status: 403 })
    }

    const site = await loadSite(session.userId)
    if (!site?.custom_domain || !site.cloudflare_zone_id) {
      return NextResponse.json({ error: 'Connect a custom domain before managing DNS' }, { status: 400 })
    }

    const [zone, records] = await Promise.all([getZone(site.cloudflare_zone_id), listDnsRecords(site.cloudflare_zone_id)])

    return NextResponse.json({
      nameservers: zone.name_servers,
      zoneStatus: zone.status,
      records: records.map((r) => ({ ...r, managed: isManaged(site.custom_domain!, r) })),
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasBuilderAccess(user)) {
      return NextResponse.json({ error: 'An active subscription is required to use the builder' }, { status: 403 })
    }

    const site = await loadSite(session.userId)
    if (!site?.custom_domain || !site.cloudflare_zone_id) {
      return NextResponse.json({ error: 'Connect a custom domain before managing DNS' }, { status: 400 })
    }

    const body = await req.json()
    const type = String(body.type ?? '').toUpperCase()
    const name = String(body.name ?? '').trim()
    const content = String(body.content ?? '').trim()
    const priority = body.priority != null ? Number(body.priority) : undefined
    const ttl = body.ttl != null ? Number(body.ttl) : undefined

    if (!ALLOWED_TYPES.includes(type)) {
      return NextResponse.json({ error: `Record type must be one of ${ALLOWED_TYPES.join(', ')}` }, { status: 400 })
    }
    if (!name || !content) {
      return NextResponse.json({ error: 'Name and content are required' }, { status: 400 })
    }
    if (type === 'MX' && (priority == null || Number.isNaN(priority))) {
      return NextResponse.json({ error: 'MX records require a priority' }, { status: 400 })
    }

    const record = await createDnsRecord(site.cloudflare_zone_id, {
      type,
      name: qualifyName(site.custom_domain, name),
      content,
      priority,
      ttl,
    })

    return NextResponse.json({ ok: true, record: { ...record, managed: false } })
  } catch (err: any) {
    return errorResponse(err)
  }
}
