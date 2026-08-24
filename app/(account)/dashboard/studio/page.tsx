import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasZeusStudioAccess } from '@/lib/access'
import StudioModeSwitch from '@/components/StudioModeSwitch'

export const dynamic = 'force-dynamic'

export default async function StudioPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = rows[0]
  if (!user) redirect('/login')
  if (!hasZeusStudioAccess(user)) redirect('/dashboard')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-5xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Studio</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2 mb-6">
              Generate AI video/voiceover or design social posts — credits are charged per AI generation.
            </p>
          </div>
          <a href="/help/studio" target="_blank" rel="noopener noreferrer" className="text-sm text-amber-600 dark:text-[#f59e0b] underline whitespace-nowrap mt-1">
            How to use Studio / FAQ
          </a>
        </div>

        <StudioModeSwitch />
      </div>
    </main>
  )
}
