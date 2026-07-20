import { Suspense } from 'react'
import SignupForm from '@/components/SignupForm'

export default function Signup() {
  return (
    <main className="min-h-screen bg-[#0b111c] text-zinc-100 antialiased flex items-center justify-center px-6">
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </main>
  )
}
