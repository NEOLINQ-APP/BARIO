import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import BarioOneDashboard from '@/components/BarioOneDashboard'

export const dynamic = 'force-dynamic'

export default async function BarioOnePage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT id FROM users WHERE id = ${session.userId}`) as unknown as User[]
  if (!rows[0]) redirect('/login')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Bario One™</h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2">
            The AI-powered operating system for your business.
          </p>
        </div>
        <BarioOneDashboard />
      </div>
    </main>
  )
}
