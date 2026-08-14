import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import RequestsPanel from '@/components/RequestsPanel'
import QuickLinks from '@/components/QuickLinks'

export const dynamic = 'force-dynamic'

export default async function RequestsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT company_label FROM client_companies WHERE user_id = ${session.userId}`) as unknown as { company_label: string }[]
  if (!rows[0]) redirect('/dashboard')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold">Requests</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2 mb-6">
          Submit a request for {rows[0].company_label} and get an estimated completion date, based on our current workload.
        </p>
        <QuickLinks />
        <RequestsPanel />
      </div>
    </main>
  )
}
