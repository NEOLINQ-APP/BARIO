import { redirect } from 'next/navigation'
import type { Metadata, Viewport } from 'next'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import BarioDialer from '@/components/BarioDialer'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sunbuilt Group Dialer',
  manifest: '/dialer-sunbuilt-manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Sunbuilt Dialer' },
  icons: { apple: '/bario-icon-192.png' },
}

export const viewport: Viewport = {
  themeColor: '#0b111c',
}

export default async function SunbuiltDialerPage({ searchParams }: { searchParams: { number?: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT is_admin FROM users WHERE id = ${session.userId}`) as unknown as Pick<User, 'is_admin'>[]
  if (!rows[0]?.is_admin) redirect('/dashboard')

  return <BarioDialer initialNumber={searchParams.number} lockedBusinessKey="sunbuilt" swScope="/admin/dialer/sunbuilt" />
}
