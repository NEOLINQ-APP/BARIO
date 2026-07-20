import { Suspense } from 'react'
import LoginForm from '@/components/LoginForm'

export default function Login() {
  return (
    <main className="min-h-screen bg-[#0b111c] text-zinc-100 antialiased flex items-center justify-center px-6">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  )
}
