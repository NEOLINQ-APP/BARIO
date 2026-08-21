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
        <h1 className="text-2xl font-bold mb-6">Spott Leads</h1>
        <BarioOneComingSoon title="Leads from Spott" phase="Phase 2" description="Spott isn't connected to Bario One yet. Once linked, every Spott lead lands here and can attach to an existing CRM contact or create a new one — that matching logic is already built." />
      </div>
    </main>
  )
}
