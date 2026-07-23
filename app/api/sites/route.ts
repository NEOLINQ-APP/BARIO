import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'
import { maxSitesForPlan } from '@/lib/plans'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasBuilderAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email to use the builder' }, { status: 403 })
    }

    const sites = (await sql`
      SELECT id, name, subdomain, custom_domain, domain_status, is_published, content_mode, updated_at
      FROM sites WHERE user_id = ${session.userId} ORDER BY updated_at DESC
    `) as unknown as unknown[]

    // Infinity doesn't survive JSON (becomes null) — send null explicitly
    // for "unlimited" so the client isn't relying on that silently happening.
    const limit = maxSitesForPlan(user.plan, user.is_admin)
    return NextResponse.json({ sites, limit: limit === Infinity ? null : limit })
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
      return NextResponse.json({ error: 'Please verify your email to use the builder' }, { status: 403 })
    }

    const countRows = (await sql`SELECT count(*)::int AS count FROM sites WHERE user_id = ${session.userId}`) as unknown as { count: number }[]
    const limit = maxSitesForPlan(user.plan, user.is_admin)
    if (countRows[0].count >= limit) {
      return NextResponse.json(
        { error: `Your plan allows ${limit === Infinity ? 'unlimited' : limit} site${limit === 1 ? '' : 's'} — upgrade to add more.` },
        { status: 403 }
      )
    }

    const { name } = await req.json().catch(() => ({}))
    const id = randomUUID()
    await sql`
      INSERT INTO sites (id, user_id, name)
      VALUES (${id}, ${session.userId}, ${typeof name === 'string' && name.trim() ? name.trim() : 'My Site'})
    `

    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
