import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { ensureCreditsRefreshed } from '@/lib/credits'
import { hasBuilderAccess } from '@/lib/access'
import Builder from '@/components/Builder'

export const dynamic = 'force-dynamic'

const DEFAULT_THEME = { primary: '#0A2342', accent: '#1a56db' }

export default async function BuildPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = userRows[0]
  if (!user) redirect('/login')
  if (!hasBuilderAccess(user)) redirect('/dashboard')

  const credits = user.is_admin ? -1 : await ensureCreditsRefreshed(sql, user)

  const siteRows = (await sql`
    SELECT name, sections_json, theme_json, subdomain, custom_domain, domain_status, is_published,
           meta_title, meta_description, analytics_id, favicon_url
    FROM sites WHERE user_id = ${session.userId} LIMIT 1
  `) as unknown as {
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
  }[]
  const site = siteRows[0]

  return (
    <Builder
      initialName={site?.name ?? 'My Site'}
      initialSections={site ? JSON.parse(site.sections_json) : []}
      initialTheme={site ? JSON.parse(site.theme_json) : DEFAULT_THEME}
      initialCredits={credits}
      userEmail={user.email}
      userPlan={user.plan}
      isAdmin={user.is_admin}
      initialSubdomain={site?.subdomain ?? null}
      initialCustomDomain={site?.custom_domain ?? null}
      initialDomainStatus={site?.domain_status ?? 'none'}
      initialPublished={site?.is_published ?? false}
      initialMetaTitle={site?.meta_title ?? ''}
      initialMetaDescription={site?.meta_description ?? ''}
      initialAnalyticsId={site?.analytics_id ?? ''}
      initialFaviconUrl={site?.favicon_url ?? ''}
    />
  )
}
