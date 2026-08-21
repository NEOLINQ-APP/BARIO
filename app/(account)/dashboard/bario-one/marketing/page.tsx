import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { getBoModuleGate } from '@/lib/barioOneModuleGate'
import BarioOneLockedModule from '@/components/BarioOneLockedModule'

export const dynamic = 'force-dynamic'

// Business OS Phase 1 — architecture/routing shell. Campaign sending
// already lives inside crm/automations; this gives Marketing its own nav
// destination without duplicating that page.
export default async function BarioOneMarketingPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT id FROM users WHERE id = ${session.userId}`) as unknown as User[]
  if (!rows[0]) redirect('/login')

  const gate = await getBoModuleGate(sql, session.userId, 'crm')
  if (!gate.hasOrg) redirect('/dashboard/bario-one')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Marketing</h1>
        {gate.locked ? (
          <BarioOneLockedModule moduleKey="crm" />
        ) : (
          <a
            href="/dashboard/bario-one/crm/automations"
            className="block rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-5 hover:border-amber-500 dark:hover:border-[#d4af37] transition-colors"
          >
            <p className="font-semibold">Campaigns &amp; automations →</p>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Send email campaigns and set up rule-based follow-ups.</p>
          </a>
        )}
      </div>
    </main>
  )
}
