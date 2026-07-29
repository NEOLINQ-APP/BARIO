import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import VpsConfigureForm from '@/components/VpsConfigureForm'

export const dynamic = 'force-dynamic'

export default async function NewServerPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT id FROM users WHERE id = ${session.userId}`) as unknown as User[]
  if (!rows[0]) redirect('/login')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-2xl">
        <a href="/dashboard/servers" className="text-sm text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200">← Servers</a>
        <h1 className="text-2xl font-bold mt-3 mb-6">Order a new server</h1>

        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-6">
          <VpsConfigureForm />
        </div>
      </div>
    </main>
  )
}
