import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'
import { resolveSiteId } from '@/lib/siteAccess'
import { errorResponse } from '@/lib/errors'

// Lets a user switch a site back to the AI-built sections model after having
// used a raw-HTML template — the template flow has no way back to Zeus
// otherwise, since TemplateBuilder never exposes a return path.
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

    const { mode, siteId: requestedSiteId } = await req.json()
    if (mode !== 'sections') {
      return NextResponse.json({ error: 'Only switching back to the AI builder is supported here' }, { status: 400 })
    }

    const siteId = await resolveSiteId(sql, session.userId, requestedSiteId)
    if (!siteId) return NextResponse.json({ error: 'No site found' }, { status: 400 })

    await sql`UPDATE sites SET content_mode = 'sections' WHERE id = ${siteId}`

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
