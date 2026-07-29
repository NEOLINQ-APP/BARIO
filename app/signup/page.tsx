import { Suspense } from 'react'
import SignupForm from '@/components/SignupForm'
import PricingAssistant from '@/components/PricingAssistant'

export default function Signup() {
  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased flex items-center justify-center px-6">
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
      <PricingAssistant />
    </main>
  )
}
