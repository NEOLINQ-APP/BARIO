'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { continueAfterAuth } from '@/lib/continueAfterAuth'
import PasswordInput from '@/components/PasswordInput'
import GoogleSignInButton from '@/components/GoogleSignInButton'

export default function LoginForm() {
  const params = useSearchParams()
  const plan = params.get('plan')
  const promoCode = params.get('promo')
  const next = params.get('next')
  const idle = params.get('idle')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(params.get('error'))
  const [loading, setLoading] = useState(false)
  const [agreedForGoogle, setAgreedForGoogle] = useState(false)

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
    await continueAfterAuth(plan, promoCode, next)
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#131b2a] shadow-xl dark:shadow-none p-8">
      <h1 className="text-2xl font-bold mb-1">Log in</h1>
      {plan && <p className="text-sm text-slate-500 dark:text-zinc-400 mb-6">Continuing with the {plan} plan</p>}
      {idle && <p className="text-sm text-amber-600 dark:text-amber-400 mb-6">You were logged out after 10 minutes of inactivity. Log back in to continue.</p>}
      <label className="block text-sm text-slate-500 dark:text-zinc-400 mt-4">Email</label>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full mt-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-slate-900 dark:text-zinc-100"
      />
      <div className="flex items-center justify-between mt-4">
        <label className="block text-sm text-slate-500 dark:text-zinc-400">Password</label>
        <a href="/forgot-password" className="text-xs text-slate-400 dark:text-zinc-500 hover:text-slate-600 dark:hover:text-zinc-300">Forgot password?</a>
      </div>
      <PasswordInput value={password} onChange={setPassword} />
      {error && <p className="text-sm text-red-500 dark:text-red-400 mt-3">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full mt-6 px-4 py-2 rounded-xl font-semibold bg-[#f59e0b] text-[#1a1200] disabled:opacity-60"
      >
        {loading ? 'Logging in…' : 'Log in'}
      </button>
      <div className="flex items-center gap-3 mt-6">
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
        <span className="text-xs text-slate-400 dark:text-zinc-500">or</span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
      </div>
      <GoogleSignInButton plan={plan} next={next} label="Continue with Google" disabled={!agreedForGoogle} />
      <label className="flex items-start gap-2 mt-3 text-xs text-slate-500 dark:text-zinc-400 cursor-pointer">
        <input
          type="checkbox"
          checked={agreedForGoogle}
          onChange={(e) => setAgreedForGoogle(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 dark:border-zinc-700"
        />
        <span>
          If this is your first time here, continuing with Google also creates an account and means you've
          read and agree to our <a href="/terms" target="_blank" className="underline">Terms of Service</a>{' '}
          and <a href="/privacy" target="_blank" className="underline">Privacy Policy</a>.
        </span>
      </label>
      <p className="text-sm text-slate-500 dark:text-zinc-400 mt-4 text-center">
        Don't have an account?{' '}
        <a
          href={`/signup?${new URLSearchParams({ ...(plan ? { plan } : {}), ...(next ? { next } : {}) }).toString()}`}
          className="text-amber-600 dark:text-[#f59e0b]"
        >
          Sign up
        </a>
      </p>
    </form>
  )
}
