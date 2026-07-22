import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'
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
      return NextResponse.json({ error: 'An active subscription is required to use the builder' }, { status: 403 })
    }

    const { subdomain, publish } = await req.json()

    const rows = (await sql`SELECT id FROM sites WHERE user_id = ${session.userId} LIMIT 1`) as unknown as { id: string }[]
    const site = rows[0]
    if (!site) return NextResponse.json({ error: 'Save your site before publishing' }, { status: 400 })

    if (subdomain !== undefined) {
      const clean = String(subdomain).trim().toLowerCase()
      if (!SUBDOMAIN_RE.test(clean)) {
        return NextResponse.json({ error: 'Subdomain must be lowercase letters, numbers, and hyphens only' }, { status: 400 })
      }
      if (RESERVED_SUBDOMAINS.has(clean)) {
        return NextResponse.json({ error: 'That subdomain is reserved' }, { status: 409 })
      }
      const taken = (await sql`SELECT id FROM sites WHERE subdomain = ${clean} AND id != ${site.id}`) as unknown as { id: string }[]
      if (taken[0]) {
        return NextResponse.json({ error: 'That subdomain is already taken' }, { status: 409 })
      }
      await sql`UPDATE sites SET subdomain = ${clean} WHERE id = ${site.id}`
    }

    if (typeof publish === 'boolean') {
      await sql`UPDATE sites SET is_published = ${publish} WHERE id = ${site.id}`
    }

    const updated = (await sql`SELECT subdomain, custom_domain, domain_status, is_published FROM sites WHERE id = ${site.id}`) as unknown as any[]
    return NextResponse.json(updated[0])
  } catch (err: any) {
    return errorResponse(err)
  }
}
