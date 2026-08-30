'use client'

import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { continueAfterAuth } from '@/lib/continueAfterAuth'

function Continue() {
  const params = useSearchParams()

  useEffect(() => {
    continueAfterAuth(params.get('plan'), params.get('promo'), params.get('next'), params.get('new') === '1')
  }, [params])

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] flex items-center justify-center">
      <p className="text-slate-500 dark:text-zinc-400">Signing you in…</p>
    </main>
  )
}

export default function ContinuePage() {
  return (
    <Suspense fallback={null}>
      <Continue />
    </Suspense>
  )
}
