import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Business OS Phase 1 — nav destination only. Distinct from the
// account-wide /dashboard/websites site builder (a different, unrelated
// product) — this is meant to eventually surface website ACTIVITY tied to
// a customer record (visits, form fills), not host the site itself.
export default async function BarioOneWebsitePage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT id FROM users WHERE id = ${session.userId}`) as unknown as User[]
  if (!rows[0]) redirect('/login')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-3">Website</h1>
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-6">
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            Not built yet — this will show website activity (visits, form fills) tied to your CRM contacts. Looking
            to manage your actual site? That's under{' '}
            <a href="/dashboard/websites" className="text-amber-600 dark:text-[#d4af37] hover:underline">Websites</a> in the main menu.
          </p>
        </div>
      </div>
    </main>
  )
}
