import type { Metadata, Viewport } from 'next'
import ClientDialerGate from '@/components/ClientDialerGate'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sunbuilt Group Dialer',
  manifest: '/dialer-sunbuilt-client-manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Sunbuilt Dialer' },
  icons: { apple: '/bario-icon-192.png' },
}

export const viewport: Viewport = {
  themeColor: '#0b111c',
}

export default function SunbuiltClientDialerPage() {
  return <ClientDialerGate businessKey="sunbuilt" businessLabel="Sunbuilt Group" swScope="/dialer/sunbuilt" />
}
