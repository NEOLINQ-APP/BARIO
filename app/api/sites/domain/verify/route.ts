import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'
import { getDomainStatus, getDomainConfig } from '@/lib/vercel'
import { errorResponse } from '@/lib/errors'

export async function POST() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasBuilderAccess(user)) {
      return NextResponse.json({ error: 'An active subscription is required to use the builder' }, { status: 403 })
    }

    const rows = (await sql`SELECT id, custom_domain FROM sites WHERE user_id = ${session.userId} LIMIT 1`) as unknown as {
      id: string
      custom_domain: string | null
    }[]
    const site = rows[0]
    if (!site?.custom_domain) return NextResponse.json({ error: 'No custom domain connected yet' }, { status: 400 })

    const [status, config] = await Promise.all([getDomainStatus(site.custom_domain), getDomainConfig(site.custom_domain)])
    const reallyVerified = status.verified && !config.misconfigured
    if (reallyVerified) {
      await sql`UPDATE sites SET domain_status = 'verified' WHERE id = ${site.id}`
    }

    return NextResponse.json({
      verified: reallyVerified,
      ownershipVerified: status.verified,
      misconfigured: config.misconfigured,
      verification: status.verification ?? [],
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
