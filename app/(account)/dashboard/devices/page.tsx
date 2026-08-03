import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import SyncedDevices from '@/components/SyncedDevices'

export const dynamic = 'force-dynamic'

export default async function DevicesPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  return <SyncedDevices />
}
