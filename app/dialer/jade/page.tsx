import type { Metadata, Viewport } from 'next'
import ClientDialerGate from '@/components/ClientDialerGate'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Jade Dialer',
  manifest: '/dialer-jade-client-manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Jade Dialer' },
  icons: { apple: '/bario-icon-192.png' },
}

export const viewport: Viewport = {
  themeColor: '#0b111c',
}

export default function JadeClientDialerPage() {
  return <ClientDialerGate businessKey="jade" businessLabel="Jade" swScope="/dialer/jade" />
}
