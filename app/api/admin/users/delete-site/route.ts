import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { removeDomainFromVercel, wwwSibling } from '@/lib/vercel'
import { deleteZone } from '@/lib/cloudflare'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Admin equivalent of /api/sites/[id] DELETE — for cleaning up a site record
// on a customer's behalf (e.g. one created by mistake via import-html
// targeting the wrong account), without needing their session.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { siteId } = await req.json()
    if (typeof siteId !== 'string' || !siteId.trim()) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 })
    }

    const rows = (await sql`
      SELECT id, name, custom_domain, cloudflare_zone_id FROM sites WHERE id = ${siteId}
    `) as unknown as { id: string; name: string; custom_domain: string | null; cloudflare_zone_id: string | null }[]
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

    await logAdminAction(sql, { action: 'delete-site', params: { siteId: site.id, name: site.name }, result: 'ok' })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
