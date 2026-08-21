import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { getBoModuleGate } from '@/lib/barioOneModuleGate'
import BarioOneLockedModule from '@/components/BarioOneLockedModule'
import BarioOneComingSoon from '@/components/BarioOneComingSoon'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const session = await getSession()
  if (!session) redirect('/login')
  const sql = await db()
  const rows = (await sql`SELECT id FROM users WHERE id = ${session.userId}`) as unknown as User[]
  if (!rows[0]) redirect('/login')
  const gate = await getBoModuleGate(sql, session.userId, 'ai_assistant')
  if (!gate.hasOrg) redirect('/dashboard/bario-one')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">AI Marketing Agent</h1>
        {gate.locked ? (
          <BarioOneLockedModule moduleKey="ai_assistant" />
        ) : (
          <BarioOneComingSoon title="Your AI marketing agent" phase="Phase 2" description="AI-researched lead discovery and campaign personalization, surfaced here — SCOUT already runs this for your own CRM data internally." />
        )}
      </div>
    </main>
  )
}
