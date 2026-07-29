import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuilderAccess, hasPaidPlan } from '@/lib/access'
import SitesList from '@/components/SitesList'
import SupportAssistant from '@/components/SupportAssistant'
import MigrateSitePanel from '@/components/MigrateSitePanel'

export const dynamic = 'force-dynamic'

export default async function WebsitesPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = rows[0]
  if (!user) redirect('/login')

  const builderAccess = hasBuilderAccess(user)

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold">Websites</h1>

        {builderAccess ? (
          <>
            <div className="flex flex-wrap gap-3 mt-6">
              <a href="/build" className="px-5 py-3 rounded-xl font-semibold bg-[#f59e0b] text-[#1a1200]">
                Open Website Builder
              </a>
              <a href="/build/templates" className="px-5 py-3 rounded-xl font-semibold border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200">
                Premium Templates
              </a>
            </div>

            <div className="mt-8 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6">
              <h2 className="text-sm font-semibold mb-4">Your sites</h2>
              <SitesList />
            </div>

            <MigrateSitePanel isPaid={hasPaidPlan(user)} />
          </>
        ) : (
          <a href="/hosting#pricing" className="inline-block mt-6 px-5 py-3 rounded-xl font-semibold bg-[#f59e0b] text-[#1a1200]">
            Choose a plan
          </a>
        )}
      </div>
      <SupportAssistant />
    </main>
  )
}
