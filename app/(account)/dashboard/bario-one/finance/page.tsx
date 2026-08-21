import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { getBoModuleGate } from '@/lib/barioOneModuleGate'
import BarioOneLockedModule from '@/components/BarioOneLockedModule'

export const dynamic = 'force-dynamic'

// Business OS Phase 1 — hub page linking to the real existing
// invoices/payments/expenses pages rather than duplicating them.
export default async function BarioOneFinancePage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT id FROM users WHERE id = ${session.userId}`) as unknown as User[]
  if (!rows[0]) redirect('/login')

  const gate = await getBoModuleGate(sql, session.userId, 'invoicing')
  if (!gate.hasOrg) redirect('/dashboard/bario-one')

  const links = [
    { href: '/dashboard/bario-one/crm/invoices', title: 'Estimates & invoices →', desc: 'Create and send quotes, invoices, and recurring bills.' },
    { href: '/dashboard/bario-one/payments', title: 'Payments →', desc: 'Accept card payments directly on your invoices.' },
    { href: '/dashboard/bario-one/expenses', title: 'Expenses →', desc: 'Track business expenses and receipts.' },
  ]

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Finance</h1>
        {gate.locked ? (
          <BarioOneLockedModule moduleKey="invoicing" />
        ) : (
          <div className="space-y-3">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="block rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-5 hover:border-amber-500 dark:hover:border-[#d4af37] transition-colors">
                <p className="font-semibold">{l.title}</p>
                <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">{l.desc}</p>
              </a>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
