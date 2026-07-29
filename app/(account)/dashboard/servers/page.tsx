import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import VpsList from '@/components/VpsList'

export const dynamic = 'force-dynamic'

export default async function ServersPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = rows[0]
  if (!user) redirect('/login')

  return (
    <main className="px-6 py-10 md:py-16 text-zinc-100">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold">Servers</h1>
        <p className="text-sm text-zinc-400 mt-2 mb-6">
          Self-managed VPS servers, powered by enterprise-grade infrastructure — order one in a couple of minutes.
        </p>

        <div className="rounded-2xl border border-zinc-800 bg-[#131b2a] p-6">
          <VpsList />
        </div>
      </div>
    </main>
  )
}
