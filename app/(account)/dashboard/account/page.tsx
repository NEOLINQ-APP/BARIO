import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import ChangePasswordForm from '@/components/ChangePasswordForm'
import ResendVerificationButton from '@/components/ResendVerificationButton'
import SupportAssistant from '@/components/SupportAssistant'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = rows[0]
  if (!user) redirect('/login')

  return (
    <main className="px-6 py-10 md:py-16 text-slate-900 dark:text-zinc-100">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold">Account</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">{user.email}</p>

        {!user.is_admin && !user.email_verified && (
          <div className="mt-6 rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
            <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">Your email isn&apos;t verified yet.</p>
            <ResendVerificationButton />
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] shadow-sm dark:shadow-none p-6">
          <h2 className="text-sm font-semibold mb-4">Change password</h2>
          <ChangePasswordForm />
        </div>
      </div>
      <SupportAssistant />
    </main>
  )
}
