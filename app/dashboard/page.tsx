import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { ensureCreditsRefreshed } from '@/lib/credits'
import LogoutButton from '@/components/LogoutButton'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  none: 'No active plan',
  active: 'Active',
  past_due: 'Payment failed — please update your card',
  canceled: 'Canceled',
}

export default async function Dashboard() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = rows[0]
  if (!user) redirect('/login')

  const credits = user.subscription_status === 'active' ? await ensureCreditsRefreshed(sql, user) : 0

  return (
    <main className="min-h-screen bg-[#0b111c] text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Your account</h1>
          <LogoutButton />
        </div>

        <div className="mt-8 rounded-2xl border border-zinc-800 bg-[#131b2a] p-6">
          <div className="text-sm text-zinc-400">{user.email}</div>

          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Plan</div>
            <div className="text-xl font-semibold mt-1 capitalize">{user.plan ?? 'None yet'}</div>
          </div>

          <div className="mt-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Status</div>
            <div className="text-lg mt-1">{STATUS_LABEL[user.subscription_status] ?? user.subscription_status}</div>
          </div>

          {user.subscription_status === 'active' && (
            <div className="mt-4">
              <div className="text-xs uppercase tracking-wide text-zinc-500">AI Builder Credits</div>
              <div className="text-lg mt-1">{credits} remaining this month</div>
            </div>
          )}

          {user.subscription_status === 'active' ? (
            <div className="flex flex-wrap gap-3 mt-6">
              <a href="/build" className="px-5 py-3 rounded-xl font-semibold bg-[#f59e0b] text-[#1a1200]">
                Open Website Builder
              </a>
              <a href="/build/templates" className="px-5 py-3 rounded-xl font-semibold border border-zinc-700 text-zinc-200">
                Premium Templates
              </a>
            </div>
          ) : (
            <a href="/#pricing" className="inline-block mt-6 px-5 py-3 rounded-xl font-semibold bg-[#f59e0b] text-[#1a1200]">
              Choose a plan
            </a>
          )}

          {user.is_admin && (
            <a href="/admin" className="inline-block mt-4 text-xs text-zinc-500 hover:text-zinc-300">
              Admin: pending template approvals →
            </a>
          )}
        </div>
      </div>
    </main>
  )
}
