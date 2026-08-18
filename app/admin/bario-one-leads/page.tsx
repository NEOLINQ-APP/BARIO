import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import AdminBarioOneLeads from '@/components/AdminBarioOneLeads'

export const dynamic = 'force-dynamic'

export default async function AdminBarioOneLeadsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  if (!rows[0]?.is_admin) redirect('/dashboard')

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-5xl mx-auto">
        <a href="/admin" className="text-sm text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200">← Admin</a>
        <h1 className="text-2xl font-bold mt-3 mb-1">Bario One — Leads & Campaigns</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mb-6">
          View and reply to any Bario One organization's CRM leads directly, and send or schedule bulk email campaigns —
          Miko can also trigger campaigns from inside that org's own AI Assistant chat.
        </p>
        <AdminBarioOneLeads />
      </div>
    </main>
  )
}
