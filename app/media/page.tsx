import { redirect } from 'next/navigation'
import type { Metadata, Viewport } from 'next'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasBuilderAccess } from '@/lib/access'
import MediaLibrary from '@/components/MediaLibrary'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Bario Media Library',
  manifest: '/media-manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Bario Media' },
  icons: { apple: '/media-icon.svg' },
}

export const viewport: Viewport = {
  themeColor: '#0b111c',
}

export default async function MediaPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = rows[0]
  if (!user || !hasBuilderAccess(user)) redirect('/dashboard')

  return <MediaLibrary />
}
