import { Suspense } from 'react'
import VerifyEmailPanel from '@/components/VerifyEmailPanel'

export default function VerifyEmail() {
  return (
    <main className="min-h-screen bg-[#0b111c] text-zinc-100 antialiased flex items-center justify-center px-6">
      <Suspense fallback={null}>
        <VerifyEmailPanel />
      </Suspense>
    </main>
  )
}
