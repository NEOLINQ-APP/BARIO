import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { ensureCreditsRefreshed } from '@/lib/credits'
import { hasPaidPlan, hasZeusStudioAccess } from '@/lib/access'
import { resolveSiteId } from '@/lib/siteAccess'
import { parsePagesJson } from '@/lib/renderSite'
import Builder from '@/components/Builder'
import TemplateBuilder from '@/components/TemplateBuilder'

export const dynamic = 'force-dynamic'

const DEFAULT_THEME = { primary: '#0A2342', accent: '#1a56db', style: 'modern', backgroundStyle: 'solid' as const }

export default async function BuildPage({ searchParams }: { searchParams: { site?: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = userRows[0]
  if (!user) redirect('/login')
  if (!hasZeusStudioAccess(user)) redirect('/dashboard')

  const credits = user.is_admin ? -1 : await ensureCreditsRefreshed(sql, user)
  const isPaid = hasPaidPlan(user)

  const resolvedSiteId = await resolveSiteId(sql, session.userId, searchParams.site)

  type SiteRow = {
    id: string
    name: string
    sections_json: string
    theme_json: string
    subdomain: string | null
    custom_domain: string | null
    domain_status: string
    is_published: boolean
    meta_title: string | null
    meta_description: string | null
    analytics_id: string | null
    favicon_url: string | null
    content_mode: 'sections' | 'template'
    raw_html: string | null
    show_badge: boolean
    business_name: string | null
    business_category: string | null
    business_hours: string | null
    business_location: string | null
    has_unpublished_changes: boolean
    draft_updated_at: string | null
    last_published_at: string | null
    draft_sections_json: string | null
    draft_theme_json: string | null
    draft_raw_html: string | null
    draft_name: string | null
    draft_meta_title: string | null
    draft_meta_description: string | null
    draft_analytics_id: string | null
    draft_business_name: string | null
    draft_business_category: string | null
    draft_business_hours: string | null
    draft_business_location: string | null
  }

  const siteRows = resolvedSiteId
    ? ((await sql`
        SELECT id, name, sections_json, theme_json, subdomain, custom_domain, domain_status, is_published,
               meta_title, meta_description, analytics_id, favicon_url, content_mode, raw_html, show_badge,
               business_name, business_category, business_hours, business_location,
               has_unpublished_changes, draft_updated_at, last_published_at,
               draft_sections_json, draft_theme_json, draft_raw_html, draft_name, draft_meta_title, draft_meta_description,
               draft_analytics_id, draft_business_name, draft_business_category, draft_business_hours, draft_business_location
        FROM sites WHERE id = ${resolvedSiteId}
      `) as unknown as SiteRow[])
    : []
  const site = siteRows[0]
  // A pending draft (has_unpublished_changes) is what the builder opens to
  // and keeps editing -- live columns stay untouched until Publish. A site
  // with no pending draft (including every pre-existing site) opens showing
  // its live content, unchanged from before this feature shipped.
  const useDraft = !!site?.has_unpublished_changes

  if (site?.content_mode === 'template' && (useDraft ? site.draft_raw_html : site.raw_html)) {
    return (
      <TemplateBuilder
        siteId={site.id}
        initialName={(useDraft ? site.draft_name : null) ?? site.name}
        initialHtml={(useDraft ? site.draft_raw_html : null) ?? site.raw_html!}
        initialCredits={credits}
        userEmail={user.email}
        userPlan={user.plan}
        isAdmin={user.is_admin}
        initialSubdomain={site.subdomain}
        initialCustomDomain={site.custom_domain}
        initialDomainStatus={site.domain_status}
        initialPublished={site.is_published}
        isPaid={isPaid}
        initialShowBadge={site.show_badge}
        initialMetaTitle={(useDraft ? site.draft_meta_title : null) ?? site.meta_title ?? ''}
        initialMetaDescription={(useDraft ? site.draft_meta_description : null) ?? site.meta_description ?? ''}
        initialAnalyticsId={(useDraft ? site.draft_analytics_id : null) ?? site.analytics_id ?? ''}
        initialFaviconUrl={site.favicon_url ?? ''}
        initialHasUnpublishedChanges={useDraft}
        initialLastPublishedAt={site.last_published_at}
      />
    )
  }

  return (
    <Builder
      siteId={site?.id ?? null}
      initialName={(useDraft ? site?.draft_name : null) ?? site?.name ?? 'My Site'}
      initialPages={site ? parsePagesJson((useDraft ? site.draft_sections_json : null) ?? site.sections_json) : [{ name: 'Home', slug: '', sections: [] }]}
      initialTheme={site ? JSON.parse((useDraft ? site.draft_theme_json : null) ?? site.theme_json) : DEFAULT_THEME}
      initialCredits={credits}
      userEmail={user.email}
      userPlan={user.plan}
      isAdmin={user.is_admin}
      initialSubdomain={site?.subdomain ?? null}
      initialCustomDomain={site?.custom_domain ?? null}
      initialDomainStatus={site?.domain_status ?? 'none'}
      initialPublished={site?.is_published ?? false}
      isPaid={isPaid}
      initialShowBadge={site?.show_badge ?? true}
      initialMetaTitle={(useDraft ? site?.draft_meta_title : null) ?? site?.meta_title ?? ''}
      initialMetaDescription={(useDraft ? site?.draft_meta_description : null) ?? site?.meta_description ?? ''}
      initialAnalyticsId={(useDraft ? site?.draft_analytics_id : null) ?? site?.analytics_id ?? ''}
      initialFaviconUrl={site?.favicon_url ?? ''}
      initialBusinessName={(useDraft ? site?.draft_business_name : null) ?? site?.business_name ?? ''}
      initialBusinessCategory={(useDraft ? site?.draft_business_category : null) ?? site?.business_category ?? ''}
      initialBusinessHours={(useDraft ? site?.draft_business_hours : null) ?? site?.business_hours ?? ''}
      initialBusinessLocation={(useDraft ? site?.draft_business_location : null) ?? site?.business_location ?? ''}
      initialHasUnpublishedChanges={useDraft}
      initialLastPublishedAt={site?.last_published_at ?? null}
    />
  )
}
