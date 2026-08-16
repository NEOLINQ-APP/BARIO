import type { Metadata, Viewport } from 'next'
import ClientDialerGate from '@/components/ClientDialerGate'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Bario.ca Dialer',
  manifest: '/dialer-bario-client-manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Bario Dialer' },
  icons: { apple: '/bario-icon-192.png' },
}

export const viewport: Viewport = {
  themeColor: '#0b111c',
}

export default function BarioClientDialerPage() {
  return <ClientDialerGate businessKey="bario" businessLabel="Bario.ca" swScope="/dialer/bario" />
}
