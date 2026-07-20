'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { continueAfterAuth } from '@/lib/continueAfterAuth'
import PasswordInput from '@/components/PasswordInput'

export default function LoginForm() {
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
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Login failed')
      setLoading(false)
      return
    }
    await continueAfterAuth(plan)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#131b2a] p-8">
      <h1 className="text-2xl font-bold mb-1">Log in</h1>
      {plan && <p className="text-sm text-zinc-400 mb-6">Continuing with the {plan} plan</p>}
      <label className="block text-sm text-zinc-400 mt-4">Email</label>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full mt-1 px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-zinc-100"
      />
      <div className="flex items-center justify-between mt-4">
        <label className="block text-sm text-zinc-400">Password</label>
        <a href="/forgot-password" className="text-xs text-zinc-500 hover:text-zinc-300">Forgot password?</a>
      </div>
      <PasswordInput value={password} onChange={setPassword} />
      {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full mt-6 px-4 py-2 rounded-xl font-semibold bg-[#f59e0b] text-[#1a1200] disabled:opacity-60"
      >
        {loading ? 'Logging in…' : 'Log in'}
      </button>
      <p className="text-sm text-zinc-400 mt-4 text-center">
        Don't have an account?{' '}
        <a href={`/signup${plan ? `?plan=${plan}` : ''}`} className="text-[#f59e0b]">Sign up</a>
      </p>
    </form>
  )
}
