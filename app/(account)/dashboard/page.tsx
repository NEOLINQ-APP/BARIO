import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { ensureCreditsRefreshed } from '@/lib/credits'
import { hasBuilderAccess, hasZeusStudioAccess } from '@/lib/access'
import ResendVerificationButton from '@/components/ResendVerificationButton'
import SupportAssistant from '@/components/SupportAssistant'
import CollectionWarningPopup from '@/components/CollectionWarningPopup'

export const dynamic = 'force-dynamic'

export default async function DashboardHome() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = rows[0]
  if (!user) redirect('/login')

  const builderAccess = hasBuilderAccess(user)
  const canBuildStudio = hasZeusStudioAccess(user)
  const credits = user.is_admin ? -1 : builderAccess ? await ensureCreditsRefreshed(sql, user) : 0

  const warningSites = (await sql`
    SELECT name FROM sites WHERE user_id = ${user.id} AND collection_status = 'warning_shown'
  `) as unknown as { name: string }[]

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">{user.email}</p>

        {!user.is_admin && !user.email_verified && (
          <div className="mt-6 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
            <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">Please verify your email to unlock the AI builder.</p>
            <ResendVerificationButton />
          </div>
        )}

        <div className="grid sm:grid-cols-3 gap-4 mt-8">
          <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] shadow-sm dark:shadow-none p-5">
            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-zinc-500">Plan</div>
            <div className="text-xl font-semibold mt-1 capitalize">{user.plan ?? 'None yet'}</div>
          </div>
          <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] shadow-sm dark:shadow-none p-5">
            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-zinc-500">Status</div>
            <div className="text-xl font-semibold mt-1 capitalize">{user.subscription_status}</div>
          </div>
          {builderAccess && (
            <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] shadow-sm dark:shadow-none p-5">
              <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-zinc-500">AI Builder Credits</div>
              <div className="text-xl font-semibold mt-1">{user.is_admin ? '∞' : credits}</div>
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-3 gap-4 mt-4">
          {canBuildStudio && (
            <a href="/dashboard/websites" className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] shadow-sm dark:shadow-none p-5 hover:border-slate-300 dark:hover:border-zinc-700 transition-colors">
              <div className="text-2xl mb-2">🌐</div>
              <div className="font-semibold">Websites</div>
              <div className="text-xs text-slate-500 dark:text-zinc-500 mt-1">Build, edit, and manage your sites</div>
            </a>
          )}
          <a href="/media" className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] shadow-sm dark:shadow-none p-5 hover:border-slate-300 dark:hover:border-zinc-700 transition-colors">
            <div className="text-2xl mb-2">📁</div>
            <div className="font-semibold">X-Drive</div>
            <div className="text-xs text-slate-500 dark:text-zinc-500 mt-1">Your files, photos, and videos</div>
          </a>
          <a href="/dashboard/billing" className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] shadow-sm dark:shadow-none p-5 hover:border-slate-300 dark:hover:border-zinc-700 transition-colors">
            <div className="text-2xl mb-2">💳</div>
            <div className="font-semibold">Billing</div>
            <div className="text-xs text-slate-500 dark:text-zinc-500 mt-1">Plan, subscription, and gift codes</div>
          </a>
        </div>
      </div>
      <SupportAssistant />
      <CollectionWarningPopup siteNames={warningSites.map((s) => s.name)} />
    </main>
  )
}
