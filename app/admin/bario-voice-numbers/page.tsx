import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import BarioVoiceNumberPicker from '@/components/BarioVoiceNumberPicker'

export const dynamic = 'force-dynamic'

export default async function BarioVoiceNumbersPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT is_admin FROM users WHERE id = ${session.userId}`) as unknown as Pick<User, 'is_admin'>[]
  if (!rows[0]?.is_admin) redirect('/dashboard')

  return <BarioVoiceNumberPicker />
}
