import { Suspense } from 'react'
import ResetPasswordForm from '@/components/ResetPasswordForm'

export default function ResetPassword() {
  return (
    <main className="min-h-screen bg-[#0b111c] text-zinc-100 antialiased flex items-center justify-center px-6">
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  )
}
