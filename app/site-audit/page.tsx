import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { ensureCreditsRefreshed } from '@/lib/credits'
import { hasBuilderAccess } from '@/lib/access'
import { DEEP_AUDIT_CREDIT_COST } from '@/lib/siteAuditChecks'
import SiteNav from '@/components/SiteNav'
import SiteFooter from '@/components/SiteFooter'
import SiteAudit from '@/components/SiteAudit'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Site Audit — bario.ca',
  description: 'A real crawl of your website — SEO, technical health, and an AI-powered action plan grounded in your actual content. Free with a Bario account.',
}

export default async function SiteAuditPage() {
  const session = await getSession()
  if (!session) redirect('/login?next=/site-audit')

  const sql = await db()
  const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = userRows[0]
  if (!user) redirect('/login?next=/site-audit')
  if (!hasBuilderAccess(user)) redirect('/dashboard')

  const credits = user.is_admin ? -1 : await ensureCreditsRefreshed(sql, user)

  return (
    <main className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased selection:bg-cyan-500 selection:text-slate-950">
      <SiteNav active="audit" />

      <section className="py-20 px-6 sm:px-12">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-4">
            Site Audit
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Paste your website's URL for a real crawl of your actual pages — SEO, technical health, and what's
            slowing you down. Then unlock an AI-powered action plan grounded in your real content — the kind of
            specific analysis a generic chatbot can't give you, because it can't crawl your site itself.
          </p>
        </div>

        <SiteAudit initialCredits={credits} deepAuditCost={DEEP_AUDIT_CREDIT_COST} />
      </section>

      <SiteFooter />
    </main>
  )
}
