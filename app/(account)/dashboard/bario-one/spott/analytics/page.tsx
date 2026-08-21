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
        <h1 className="text-2xl font-bold mb-6">Spott Analytics</h1>
        <BarioOneComingSoon title="Spott performance" phase="Phase 2" description="Spott isn't connected to Bario One yet — see the Spott overview for details." />
      </div>
    </main>
  )
}
