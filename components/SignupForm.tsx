'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { continueAfterAuth } from '@/lib/continueAfterAuth'
import PasswordInput from '@/components/PasswordInput'

export default function SignupForm() {
  const params = useSearchParams()
  const plan = params.get('plan')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Signup failed')
      setLoading(false)
      return
    }
    await continueAfterAuth(plan)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#131b2a] shadow-xl dark:shadow-none p-8">
      <h1 className="text-2xl font-bold mb-1">Create your account</h1>
      {plan && <p className="text-sm text-slate-500 dark:text-zinc-400 mb-6">Continuing with the {plan} plan</p>}
      <label className="block text-sm text-slate-500 dark:text-zinc-400 mt-4">Email</label>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100"
      />
      <label className="block text-sm text-slate-500 dark:text-zinc-400 mt-4">Password</label>
      <PasswordInput value={password} onChange={setPassword} minLength={8} />
      {error && <p className="text-sm text-red-500 dark:text-red-400 mt-3">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full mt-6 px-4 py-2 rounded-xl font-semibold bg-[#f59e0b] text-[#1a1200] disabled:opacity-60"
      >
        {loading ? 'Creating account…' : 'Sign up'}
      </button>
      <p className="text-xs text-slate-400 dark:text-zinc-500 mt-4 text-center">
        By signing up you agree to our{' '}
        <a href="/terms" className="underline">Terms</a> and{' '}
        <a href="/privacy" className="underline">Privacy Policy</a>.
      </p>
      <p className="text-sm text-slate-500 dark:text-zinc-400 mt-4 text-center">
        Already have an account?{' '}
        <a href={`/login${plan ? `?plan=${plan}` : ''}`} className="text-amber-600 dark:text-[#f59e0b]">Log in</a>
      </p>
    </form>
  )
}
