import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuilderAccess, hasPaidPlan } from '@/lib/access'
import { resolveSiteId } from '@/lib/siteAccess'
import { errorResponse } from '@/lib/errors'

const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

// These already have their own DNS records on bario.ca pointing away from
// Vercel, so claiming them would save fine but never actually resolve.
const RESERVED_SUBDOMAINS = new Set(['www', 'admin', 'hub', 'mail'])

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasBuilderAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email to use the builder' }, { status: 403 })
    }

    const { siteId: requestedSiteId, subdomain, publish, showBadge } = await req.json()

    const siteId = await resolveSiteId(sql, session.userId, requestedSiteId)
    if (!siteId) return NextResponse.json({ error: 'Save your site before publishing' }, { status: 400 })

    if (subdomain !== undefined) {
      const clean = String(subdomain).trim().toLowerCase()
      if (!SUBDOMAIN_RE.test(clean)) {
        return NextResponse.json({ error: 'Subdomain must be lowercase letters, numbers, and hyphens only' }, { status: 400 })
      }
      if (RESERVED_SUBDOMAINS.has(clean)) {
        return NextResponse.json({ error: 'That subdomain is reserved' }, { status: 409 })
      }
      const taken = (await sql`SELECT id FROM sites WHERE subdomain = ${clean} AND id != ${siteId}`) as unknown as { id: string }[]
      if (taken[0]) {
        return NextResponse.json({ error: 'That subdomain is already taken' }, { status: 409 })
      }
      await sql`UPDATE sites SET subdomain = ${clean} WHERE id = ${siteId}`
    }

    if (typeof publish === 'boolean') {
      await sql`UPDATE sites SET is_published = ${publish} WHERE id = ${siteId}`
    }

    // Only a paying account can actually turn the badge off — enforced here,
    // not just hidden in the UI, since this request is easy to replay.
    if (typeof showBadge === 'boolean') {
      if (!hasPaidPlan(user)) {
        return NextResponse.json({ error: 'Upgrade to a paid plan to remove the Bario badge' }, { status: 403 })
      }
      await sql`UPDATE sites SET show_badge = ${showBadge} WHERE id = ${siteId}`
    }

    const updated = (await sql`SELECT id, subdomain, custom_domain, domain_status, is_published, show_badge FROM sites WHERE id = ${siteId}`) as unknown as any[]
    return NextResponse.json(updated[0])
  } catch (err: any) {
    return errorResponse(err)
  }
}
