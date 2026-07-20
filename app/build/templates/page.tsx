import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import TemplateGallery from '@/components/TemplateGallery'

export const dynamic = 'force-dynamic'

export default async function TemplatesGalleryPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = rows[0]
  if (!user) redirect('/login')
  if (user.subscription_status !== 'active') redirect('/dashboard')

  return <TemplateGallery />
}
