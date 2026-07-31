import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import StudioEditorPoc from '@/components/StudioEditorPoc'

export const dynamic = 'force-dynamic'

// Temporary proof-of-concept route (build-order step 1 of the approved
// Studio Ecosystem plan) — confirms @openvideo/core + @openvideo/engine-pixi
// actually work in this app before the full timeline UI is built on top.
// Remove once the real editor replaces /dashboard/studio.
export default async function StudioEditorPocPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = rows[0]
  if (!user) redirect('/login')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold">Studio Editor — proof of concept</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2 mb-6">
          Not a real feature yet — testing that the timeline/rendering engine works.
        </p>
        <StudioEditorPoc />
      </div>
    </main>
  )
}
