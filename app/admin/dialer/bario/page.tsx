import { redirect } from 'next/navigation'
import type { Metadata, Viewport } from 'next'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import BarioDialer from '@/components/BarioDialer'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Bario.ca Dialer',
  manifest: '/dialer-bario-manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Bario Dialer' },
  icons: { apple: '/bario-icon-192.png' },
}

export const viewport: Viewport = {
  themeColor: '#0b111c',
}

export default async function BarioDialerPage({ searchParams }: { searchParams: { number?: string } }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT is_admin FROM users WHERE id = ${session.userId}`) as unknown as Pick<User, 'is_admin'>[]
  if (!rows[0]?.is_admin) redirect('/dashboard')

  return <BarioDialer initialNumber={searchParams.number} lockedBusinessKey="bario" swScope="/admin/dialer/bario" />
}
