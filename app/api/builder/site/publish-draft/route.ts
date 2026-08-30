import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasZeusStudioAccess } from '@/lib/access'
import { resolveSiteId } from '@/lib/siteAccess'
import { errorResponse } from '@/lib/errors'

// Promotes a site's staged draft_* columns to the live columns that
// app/site/[domain]/[[...path]]/route.ts serves to real visitors. This is
// deliberately separate from app/api/sites/publish/route.ts, which only
// controls whether a site is live at a URL at all (is_published, subdomain)
// -- that stays untouched here. Before overwriting, snapshots the site's
// *current* live content into site_versions, giving free one-level rollback
// history as a byproduct (see lib/db.ts's schema comment).
export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasZeusStudioAccess(user)) {
      return NextResponse.json({ error: 'Please verify your email to use the builder' }, { status: 403 })
    }

    const { siteId: requestedSiteId } = await req.json().catch(() => ({ siteId: undefined }))
    const siteId = await resolveSiteId(sql, session.userId, requestedSiteId)
    if (!siteId) return NextResponse.json({ error: 'No site found to publish' }, { status: 404 })

    const result = await sql.begin(async (tx: any) => {
      const rows = (await tx`SELECT * FROM sites WHERE id = ${siteId} AND user_id = ${session.userId}`) as unknown as any[]
      const site = rows[0]
      if (!site) return null
      if (!site.has_unpublished_changes) return { alreadyPublished: true }

      await tx`
        INSERT INTO site_versions (id, site_id, sections_json, theme_json, raw_html, name, meta_title, meta_description, published_by)
        VALUES (${randomUUID()}, ${site.id}, ${site.sections_json}, ${site.theme_json}, ${site.raw_html}, ${site.name}, ${site.meta_title}, ${site.meta_description}, ${session.userId})
      `

      await tx`
        UPDATE sites SET
          name = COALESCE(draft_name, name),
          sections_json = COALESCE(draft_sections_json, sections_json),
          theme_json = COALESCE(draft_theme_json, theme_json),
          raw_html = COALESCE(draft_raw_html, raw_html),
          meta_title = COALESCE(draft_meta_title, meta_title),
          meta_description = COALESCE(draft_meta_description, meta_description),
          analytics_id = COALESCE(draft_analytics_id, analytics_id),
          business_name = COALESCE(draft_business_name, business_name),
          business_category = COALESCE(draft_business_category, business_category),
          business_hours = COALESCE(draft_business_hours, business_hours),
          business_location = COALESCE(draft_business_location, business_location),
          has_unpublished_changes = false,
          last_published_at = now(),
          updated_at = now()
        WHERE id = ${site.id}
      `
      return { alreadyPublished: false }
    })

    if (!result) return NextResponse.json({ error: 'Site not found' }, { status: 404 })
    return NextResponse.json({ ok: true, ...result })
  } catch (err: any) {
    return errorResponse(err)
  }
}
