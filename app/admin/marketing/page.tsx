import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import AdminMarketing from '@/components/AdminMarketing'

export const dynamic = 'force-dynamic'

export default async function AdminMarketingPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  if (!rows[0]?.is_admin) redirect('/dashboard')

  return <AdminMarketing />
}
