import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import BarioOneCrmPipeline from '@/components/BarioOneCrmPipeline'

export const dynamic = 'force-dynamic'

export default async function BarioOneCrmPipelinePage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT id FROM users WHERE id = ${session.userId}`) as unknown as User[]
  if (!rows[0]) redirect('/login')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-6xl">
        <a href="/dashboard/bario-one/crm" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline">
          ← Customers
        </a>
        <h1 className="text-2xl font-bold mt-3 mb-6">Sales Pipeline</h1>
        <BarioOneCrmPipeline />
      </div>
    </main>
  )
}
