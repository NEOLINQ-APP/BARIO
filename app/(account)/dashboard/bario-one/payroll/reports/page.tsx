import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import BarioOnePayrollReports from '@/components/BarioOnePayrollReports'

export const dynamic = 'force-dynamic'

export default async function BarioOnePayrollReportsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT id FROM users WHERE id = ${session.userId}`) as unknown as User[]
  if (!rows[0]) redirect('/login')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-4xl">
        <a href="/dashboard/bario-one/payroll" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline">
          ← Payroll
        </a>
        <h1 className="text-2xl font-bold mt-3 mb-6">Payroll Reports</h1>
        <BarioOnePayrollReports />
      </div>
    </main>
  )
}
