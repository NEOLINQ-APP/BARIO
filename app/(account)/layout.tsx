import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import AccountSidebar from '@/components/AccountSidebar'
import IdleLogout from '@/components/IdleLogout'

// Shared persistent-sidebar shell for every logged-in account page (Home,
// Websites, X-Drive, Billing, Account) — a route group so the URLs stay
// exactly what they were before (/dashboard, /media, etc.), just with a
// consistent nav around them instead of each being its own standalone page.
// /build and /build/templates deliberately live OUTSIDE this group — the
// AI builder is a full-screen editor experience, not a "section" of the
// dashboard you'd want chrome around.
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT email, is_admin FROM users WHERE id = ${session.userId}`) as unknown as Pick<User, 'email' | 'is_admin'>[]
  const user = rows[0]
  if (!user) redirect('/login')

  const clientCompanyRows = (await sql`SELECT company_label FROM client_companies WHERE user_id = ${session.userId}`) as unknown as { company_label: string }[]
  const clientCompanyLabel = clientCompanyRows[0]?.company_label ?? null

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b111c] flex flex-col md:flex-row">
      <AccountSidebar email={user.email} isAdmin={user.is_admin} clientCompanyLabel={clientCompanyLabel} />
      <div className="flex-1 min-w-0">{children}</div>
      <IdleLogout />
    </div>
  )
}
