import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User, type VoiceAgentOrder } from '@/lib/db'
import VoiceAgentConfigureForm from '@/components/VoiceAgentConfigureForm'

export const dynamic = 'force-dynamic'

export default async function VoiceAgentPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = userRows[0]
  if (!user) redirect('/login')

  const orders = (await sql`SELECT * FROM voice_agent_orders WHERE user_id = ${user.id} ORDER BY created_at DESC`) as unknown as VoiceAgentOrder[]

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-1">Voice Agent</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mb-6">
          A real Twilio number that rings your phone first — if you don't answer, an AI picks up, talks to the caller, and captures their info.
        </p>

        {orders.length > 0 && (
          <div className="mb-6 space-y-2">
            {orders.map((o) => (
              <div key={o.id} className="rounded-xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{o.business_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${o.status === 'active' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                    {o.status === 'active' ? 'Active' : o.status === 'pending_build' ? 'Setting up — usually within a day' : 'Awaiting payment'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] shadow-sm dark:shadow-none p-6">
          <h2 className="text-sm font-semibold mb-4">Order a Voice Agent</h2>
          <VoiceAgentConfigureForm />
        </div>
      </div>
    </main>
  )
}
