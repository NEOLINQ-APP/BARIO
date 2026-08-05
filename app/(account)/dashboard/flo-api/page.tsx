import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasPaidPlan } from '@/lib/access'
import FloApiKeys from '@/components/FloApiKeys'

export const dynamic = 'force-dynamic'

export default async function FloApiPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = rows[0]
  if (!user) redirect('/login')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold">Flo API</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2 mb-6">
          Generate an API key to read your Flo CRM contacts and captured leads programmatically, or build your own integrations.
        </p>

        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] shadow-sm dark:shadow-none p-6">
          {hasPaidPlan(user) ? (
            <FloApiKeys />
          ) : (
            <p className="text-sm text-slate-500 dark:text-zinc-400">
              The Flo API is available on paid plans. <a href="/dashboard/billing" className="text-cyan-600 dark:text-cyan-400 underline">Upgrade to unlock it</a>.
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
