import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { getBoModuleGate } from '@/lib/barioOneModuleGate'
import BarioOnePosCheckout from '@/components/BarioOnePosCheckout'
import BarioOneLockedModule from '@/components/BarioOneLockedModule'

export const dynamic = 'force-dynamic'

export default async function BarioOnePosPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT id FROM users WHERE id = ${session.userId}`) as unknown as User[]
  if (!rows[0]) redirect('/login')

  const gate = await getBoModuleGate(sql, session.userId, 'pos')
  if (!gate.hasOrg) redirect('/dashboard/bario-one')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <a href="/dashboard/bario-one" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline">
              ← Bario One
            </a>
            <h1 className="text-2xl font-bold mt-1">Register</h1>
          </div>
          {!gate.locked && (
            <div className="flex gap-3">
              <a href="/dashboard/bario-one/pos/products" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline">Products →</a>
              <a href="/dashboard/bario-one/pos/sales" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline">Sales →</a>
            </div>
          )}
        </div>
        {gate.locked ? <BarioOneLockedModule moduleKey="pos" /> : <BarioOnePosCheckout />}
      </div>
    </main>
  )
}
