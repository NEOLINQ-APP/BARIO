import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import BarioOneInviteAccept from '@/components/BarioOneInviteAccept'

export const dynamic = 'force-dynamic'

export default async function BarioOneInvitePage({ searchParams }: { searchParams: { token?: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT id FROM users WHERE id = ${session.userId}`) as unknown as User[]
  if (!rows[0]) redirect('/login')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-md">
        <BarioOneInviteAccept token={searchParams.token ?? ''} />
      </div>
    </main>
  )
}
