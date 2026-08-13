import type { Metadata, Viewport } from 'next'
import VictoriaFamilyChat from '@/components/VictoriaFamilyChat'

export const dynamic = 'force-dynamic'

// Manifest is per-member (see public/victoria-family-<key>-manifest.json)
// so each install gets its own home-screen icon pointing at the right
// person's own chat, not a shared/ambiguous one.
export async function generateMetadata({ params }: { params: { member: string } }): Promise<Metadata> {
  return {
    title: 'Victoria',
    manifest: `/victoria-family-${params.member}-manifest.json`,
    appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Victoria' },
    icons: { apple: '/victoria-avatar-192.png' },
  }
}

export const viewport: Viewport = {
  themeColor: '#0b111c',
}

export default function VictoriaFamilyPage({ params }: { params: { member: string } }) {
  return <VictoriaFamilyChat memberKey={params.member} />
}
