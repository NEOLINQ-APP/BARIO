import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import AdminCrmOutreach from '@/components/AdminCrmOutreach'

export const dynamic = 'force-dynamic'

export default async function AdminCrmOutreachPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  if (!rows[0]?.is_admin) redirect('/dashboard')

  return <AdminCrmOutreach />
}
