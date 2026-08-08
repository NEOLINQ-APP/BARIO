import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import BarioOneApiKeys from '@/components/BarioOneApiKeys'
import BarioOneWebhooks from '@/components/BarioOneWebhooks'

export const dynamic = 'force-dynamic'

export default async function BarioOneApiPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT id FROM users WHERE id = ${session.userId}`) as unknown as User[]
  if (!rows[0]) redirect('/login')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-2xl">
        <a href="/dashboard/bario-one" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline">
          ← Bario One
        </a>
        <h1 className="text-2xl font-bold mt-3 mb-6">Flo API</h1>
        <BarioOneApiKeys />

        <h2 className="text-xl font-bold mt-10 mb-4">Integrations</h2>
        <BarioOneWebhooks />
      </div>
    </main>
  )
}
