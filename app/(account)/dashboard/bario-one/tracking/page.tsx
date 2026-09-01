import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { getBoModuleGate } from '@/lib/barioOneModuleGate'
import BarioOneTracking from '@/components/BarioOneTracking'
import BarioOneLockedModule from '@/components/BarioOneLockedModule'

export const dynamic = 'force-dynamic'

export default async function BarioOneTrackingPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT id FROM users WHERE id = ${session.userId}`) as unknown as User[]
  if (!rows[0]) redirect('/login')

  const gate = await getBoModuleGate(sql, session.userId, 'employees')
  if (!gate.hasOrg) redirect('/dashboard/bario-one')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold mb-2">Field Tracking</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mb-6">
          Live vehicle location and automatic arrival detection for jobs in the field.
        </p>
        {gate.locked ? <BarioOneLockedModule moduleKey="employees" /> : <BarioOneTracking />}
      </div>
    </main>
  )
}
