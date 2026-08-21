import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { getBoModuleGate } from '@/lib/barioOneModuleGate'
import BarioOneSpottConnect from '@/components/BarioOneSpottConnect'
import BarioOneLockedModule from '@/components/BarioOneLockedModule'

export const dynamic = 'force-dynamic'

// Phase 2 (2026-08-21) — real connection, not a placeholder. Search an
// existing Spott listing (human-approval required to claim it) or
// provision a brand-new one (no prior owner to conflict with).
export default async function BarioOneSpottPage() {
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
        <h1 className="text-2xl font-bold mb-3">Spott</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-zinc-400">
          Connect your Spott.ca listing to sync leads, reviews, and promotions into this CRM.
        </p>
        {gate.locked ? <BarioOneLockedModule moduleKey="crm" /> : <BarioOneSpottConnect />}
      </div>
    </main>
  )
}
