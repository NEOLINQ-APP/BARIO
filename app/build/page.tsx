import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import Builder from '@/components/Builder'

export const dynamic = 'force-dynamic'

export default async function BuildPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = userRows[0]
  if (!user) redirect('/login')
  if (user.subscription_status !== 'active') redirect('/dashboard')

  const siteRows = (await sql`SELECT name, sections_json FROM sites WHERE user_id = ${session.userId} LIMIT 1`) as unknown as {
    name: string
    sections_json: string
  }[]
  const site = siteRows[0]

  return (
    <Builder
      initialName={site?.name ?? 'My Site'}
      initialSections={site ? JSON.parse(site.sections_json) : []}
    />
  )
}
