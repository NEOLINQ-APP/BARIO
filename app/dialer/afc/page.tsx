import type { Metadata, Viewport } from 'next'
import ClientDialerGate from '@/components/ClientDialerGate'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'AFC Logistics Dialer',
  manifest: '/dialer-afc-client-manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'AFC Dialer' },
  icons: { apple: '/bario-icon-192.png' },
}

export const viewport: Viewport = {
  themeColor: '#0b111c',
}

export default function AfcClientDialerPage() {
  return <ClientDialerGate businessKey="afc" businessLabel="AFC Logistics" swScope="/dialer/afc" />
}
