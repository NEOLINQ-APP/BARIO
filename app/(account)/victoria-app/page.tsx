import { redirect } from 'next/navigation'
import type { Metadata, Viewport } from 'next'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import VictoriaAppChat from '@/components/VictoriaAppChat'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Victoria',
  manifest: '/victoria-app-manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Victoria' },
  icons: { apple: '/victoria-avatar-192.png' },
}

export const viewport: Viewport = {
  themeColor: '#0b111c',
}

// Sherwin's own single-operator work tool — not customer-facing, gated to
// his specific account (matching app/api/victoria/app/chat/route.ts's own
// OWNER_EMAIL check server-side; this redirect is the UI-side counterpart).
const OWNER_EMAIL = 'uniquegroup.org@gmail.com'

export default async function VictoriaAppPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const sql = await db()
  const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = rows[0]
  if (!user || user.email.toLowerCase() !== OWNER_EMAIL) redirect('/dashboard')

  return <VictoriaAppChat />
}
