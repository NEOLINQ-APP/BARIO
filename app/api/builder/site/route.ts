import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasZeusStudioAccess } from '@/lib/access'
import { isValidGa4Id, parsePagesJson } from '@/lib/renderSite'
import { resolveSiteId } from '@/lib/siteAccess'
import { errorResponse } from '@/lib/errors'

const DEFAULT_THEME = { primary: '#0A2342', accent: '#1a56db', style: 'modern', backgroundStyle: 'solid' as const }

export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = userRows[0]
  if (!user || !hasZeusStudioAccess(user)) {
    return NextResponse.json({ error: 'Please verify your email to use the builder' }, { status: 403 })
  }

  const requestedSiteId = new URL(req.url).searchParams.get('site')
  const siteId = await resolveSiteId(sql, session.userId, requestedSiteId)

  const rows = siteId
    ? ((await sql`SELECT * FROM sites WHERE id = ${siteId}`) as unknown as {
        id: string
        name: string
        sections_json: string
        theme_json: string
        meta_title: string | null
        meta_description: string | null
        analytics_id: string | null
        favicon_url: string | null
        business_name: string | null
        business_category: string | null
        business_hours: string | null
        business_location: string | null
        has_unpublished_changes: boolean
        draft_updated_at: string | null
        last_published_at: string | null
        draft_sections_json: string | null
        draft_theme_json: string | null
        draft_name: string | null
        draft_meta_title: string | null
        draft_meta_description: string | null
        draft_analytics_id: string | null
        draft_business_name: string | null
        draft_business_category: string | null
        draft_business_hours: string | null
        draft_business_location: string | null
      }[])
    : []
  const site = rows[0]
  // A pending draft (has_unpublished_changes) is what the builder shows and
  // keeps editing -- the live columns stay untouched until Publish. A site
  // with no pending draft (including every site that existed before this
  // feature shipped) falls back to its live columns, unchanged behavior.
  const useDraft = !!site?.has_unpublished_changes

  return NextResponse.json({
    id: site?.id ?? null,
    name: (useDraft ? site?.draft_name : null) ?? site?.name ?? 'My Site',
    pages: site ? parsePagesJson((useDraft ? site.draft_sections_json : null) ?? site.sections_json) : [{ name: 'Home', slug: '', sections: [] }],
    theme: site ? JSON.parse((useDraft ? site.draft_theme_json : null) ?? site.theme_json) : DEFAULT_THEME,
    metaTitle: (useDraft ? site?.draft_meta_title : null) ?? site?.meta_title ?? '',
    metaDescription: (useDraft ? site?.draft_meta_description : null) ?? site?.meta_description ?? '',
    analyticsId: (useDraft ? site?.draft_analytics_id : null) ?? site?.analytics_id ?? '',
    faviconUrl: site?.favicon_url ?? '',
    businessName: (useDraft ? site?.draft_business_name : null) ?? site?.business_name ?? '',
    businessCategory: (useDraft ? site?.draft_business_category : null) ?? site?.business_category ?? '',
    businessHours: (useDraft ? site?.draft_business_hours : null) ?? site?.business_hours ?? '',
    businessLocation: (useDraft ? site?.draft_business_location : null) ?? site?.business_location ?? '',
    hasUnpublishedChanges: useDraft,
    draftUpdatedAt: site?.draft_updated_at ?? null,
    lastPublishedAt: site?.last_published_at ?? null,
  })
}

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

    const {
      siteId: requestedSiteId,
      name,
      pages,
      theme,
      metaTitle,
      metaDescription,
      analyticsId,
      businessName,
      businessCategory,
      businessHours,
      businessLocation,
    } = await req.json()
    if (!Array.isArray(pages) || pages.length === 0 || !pages.every((p: any) => typeof p?.slug === 'string' && Array.isArray(p?.sections))) {
      return NextResponse.json({ error: 'pages must be a non-empty array of { name, slug, sections }' }, { status: 400 })
    }
    const slugs = pages.map((p: any) => p.slug)
    if (new Set(slugs).size !== slugs.length) {
      return NextResponse.json({ error: 'Page slugs must be unique' }, { status: 400 })
    }

    const cleanAnalyticsId = typeof analyticsId === 'string' ? analyticsId.trim() : ''
    if (cleanAnalyticsId && !isValidGa4Id(cleanAnalyticsId)) {
      return NextResponse.json({ error: 'Analytics ID must be a GA4 measurement ID, e.g. G-ABC1234DEF' }, { status: 400 })
    }

    const siteId = await resolveSiteId(sql, session.userId, requestedSiteId)
    const sectionsJson = JSON.stringify({ pages })
    const themeJson = JSON.stringify(theme ?? DEFAULT_THEME)
    const siteName = typeof name === 'string' && name.trim() ? name.trim() : 'My Site'
    const cleanMetaTitle = typeof metaTitle === 'string' && metaTitle.trim() ? metaTitle.trim() : null
    const cleanMetaDescription = typeof metaDescription === 'string' && metaDescription.trim() ? metaDescription.trim() : null
    const cleanBusinessName = typeof businessName === 'string' && businessName.trim() ? businessName.trim() : null
    const cleanBusinessCategory = typeof businessCategory === 'string' && businessCategory.trim() ? businessCategory.trim() : null
    const cleanBusinessHours = typeof businessHours === 'string' && businessHours.trim() ? businessHours.trim() : null
    const cleanBusinessLocation = typeof businessLocation === 'string' && businessLocation.trim() ? businessLocation.trim() : null

    // Every edit lands in draft_* columns, never the live ones -- a real
    // visitor sees nothing until the owner hits Publish
    // (/api/builder/site/publish-draft). See lib/db.ts's schema comment for
    // the full staging-gate design.
    let finalId = siteId
    if (siteId) {
      await sql`
        UPDATE sites SET
          draft_name = ${siteName}, draft_sections_json = ${sectionsJson}, draft_theme_json = ${themeJson},
          draft_meta_title = ${cleanMetaTitle}, draft_meta_description = ${cleanMetaDescription},
          draft_analytics_id = ${cleanAnalyticsId || null},
          draft_business_name = ${cleanBusinessName}, draft_business_category = ${cleanBusinessCategory},
          draft_business_hours = ${cleanBusinessHours}, draft_business_location = ${cleanBusinessLocation},
          has_unpublished_changes = true, draft_updated_at = now(), updated_at = now()
        WHERE id = ${siteId}
      `
    } else {
      finalId = randomUUID()
      await sql`
        INSERT INTO sites (
          id, user_id, name,
          draft_name, draft_sections_json, draft_theme_json, draft_meta_title, draft_meta_description, draft_analytics_id,
          draft_business_name, draft_business_category, draft_business_hours, draft_business_location,
          has_unpublished_changes, draft_updated_at
        )
        VALUES (
          ${finalId}, ${session.userId}, ${siteName},
          ${siteName}, ${sectionsJson}, ${themeJson}, ${cleanMetaTitle}, ${cleanMetaDescription}, ${cleanAnalyticsId || null},
          ${cleanBusinessName}, ${cleanBusinessCategory}, ${cleanBusinessHours}, ${cleanBusinessLocation},
          true, now()
        )
      `
    }

    return NextResponse.json({ ok: true, id: finalId })
  } catch (err: any) {
    return errorResponse(err)
  }
}
