import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'
import { removeDomainFromVercel, wwwSibling } from '@/lib/vercel'
import { deleteZone } from '@/lib/cloudflare'
import { errorResponse } from '@/lib/errors'

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasBuilderAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email to use the builder' }, { status: 403 })
    }

    const rows = (await sql`
      SELECT id, custom_domain, cloudflare_zone_id FROM sites WHERE id = ${params.id} AND user_id = ${session.userId}
    `) as unknown as { id: string; custom_domain: string | null; cloudflare_zone_id: string | null }[]
    const site = rows[0]
    if (!site) return NextResponse.json({ error: 'Site not found' }, { status: 404 })

    if (site.custom_domain) {
      await removeDomainFromVercel(site.custom_domain).catch(() => {})
      const www = wwwSibling(site.custom_domain)
      if (www) await removeDomainFromVercel(www).catch(() => {})
    }
    if (site.cloudflare_zone_id) {
      await deleteZone(site.cloudflare_zone_id).catch(() => {})
    }

    await sql`DELETE FROM sites WHERE id = ${site.id}`

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
