import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import CrmWorkspace from '@/components/CrmWorkspace'

export const dynamic = 'force-dynamic'

export default async function CrmPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = rows[0]
  if (!user) redirect('/login')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold">CRM</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2 mb-6">
          A real, private CRM — your own dedicated instance on its own subdomain, leads, contacts, and deals, powered by Twenty CRM.
        </p>

        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] shadow-sm dark:shadow-none p-6">
          <CrmWorkspace />
        </div>
      </div>
    </main>
  )
}
