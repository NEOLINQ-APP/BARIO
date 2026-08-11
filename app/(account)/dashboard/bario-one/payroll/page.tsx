import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { getBoModuleGate } from '@/lib/barioOneModuleGate'
import BarioOnePayrollList from '@/components/BarioOnePayrollList'
import BarioOneLockedModule from '@/components/BarioOneLockedModule'

export const dynamic = 'force-dynamic'

export default async function BarioOnePayrollPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT id FROM users WHERE id = ${session.userId}`) as unknown as User[]
  if (!rows[0]) redirect('/login')

  const gate = await getBoModuleGate(sql, session.userId, 'payroll')
  if (!gate.hasOrg) redirect('/dashboard/bario-one')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-4xl">
        <a href="/dashboard/bario-one" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline">
          ← Bario One
        </a>
        <h1 className="text-2xl font-bold mt-3 mb-6">Payroll</h1>
        {gate.locked ? <BarioOneLockedModule moduleKey="payroll" /> : <BarioOnePayrollList />}
      </div>
    </main>
  )
}
