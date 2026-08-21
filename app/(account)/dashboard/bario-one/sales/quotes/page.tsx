import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { getBoModuleGate } from '@/lib/barioOneModuleGate'
import BarioOneLockedModule from '@/components/BarioOneLockedModule'

export const dynamic = 'force-dynamic'

export default async function BarioOneQuotesPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  const sql = await db()
  const rows = (await sql`SELECT id FROM users WHERE id = ${session.userId}`) as unknown as User[]
  if (!rows[0]) redirect('/login')
  const gate = await getBoModuleGate(sql, session.userId, 'invoicing')
  if (!gate.hasOrg) redirect('/dashboard/bario-one')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Quotes</h1>
        {gate.locked ? (
          <BarioOneLockedModule moduleKey="invoicing" />
        ) : (
          <a href="/dashboard/bario-one/crm/invoices" className="block rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-5 hover:border-amber-500 dark:hover:border-[#d4af37] transition-colors">
            <p className="font-semibold">Estimates &amp; invoices →</p>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Quotes live here alongside invoices — create one and convert it once approved.</p>
          </a>
        )}
      </div>
    </main>
  )
}
