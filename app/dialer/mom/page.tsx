import type { Metadata, Viewport } from 'next'
import ClientDialerGate from '@/components/ClientDialerGate'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Mom Dialer',
  manifest: '/dialer-mom-client-manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Mom Dialer' },
  icons: { apple: '/bario-icon-192.png' },
}

export const viewport: Viewport = {
  themeColor: '#0b111c',
}

export default function MomClientDialerPage() {
  return <ClientDialerGate businessKey="mom" businessLabel="Mom" swScope="/dialer/mom" />
}
