import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Business OS Phase 1 — nav destination only. Spott.ca is a genuinely
// separate product (its own Supabase project, its own app) with no
// existing integration into Bario One's CRM — this page is honest about
// that rather than pretending a connection exists.
export default async function BarioOneSpottPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT id FROM users WHERE id = ${session.userId}`) as unknown as User[]
  if (!rows[0]) redirect('/login')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-3">Spott</h1>
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-6">
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            Spott isn't connected to Bario One yet — it runs as a separate product today. Once it's linked, its
            listings, leads, and deals will show up here against the same customer records as the rest of your CRM.
          </p>
        </div>
      </div>
    </main>
  )
}
