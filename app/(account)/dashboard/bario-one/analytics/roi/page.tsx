import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import BarioOneComingSoon from '@/components/BarioOneComingSoon'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await getSession()
  if (!session) redirect('/login')
  const sql = await db()
  const rows = (await sql`SELECT id FROM users WHERE id = ${session.userId}`) as unknown as User[]
  if (!rows[0]) redirect('/login')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">ROI</h1>
        <BarioOneComingSoon title="Return on marketing spend" phase="Phase 2" description="Compare what you spent on each channel against the revenue it produced." />
      </div>
    </main>
  )
}
