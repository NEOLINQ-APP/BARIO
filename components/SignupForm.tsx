'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { continueAfterAuth } from '@/lib/continueAfterAuth'
import PasswordInput from '@/components/PasswordInput'
import GoogleSignInButton from '@/components/GoogleSignInButton'

export default function SignupForm() {
  const params = useSearchParams()
  const plan = params.get('plan')
  const promoCode = params.get('promo')
  const next = params.get('next')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!agreed) {
      setError('Please confirm you have read and agree to the Terms of Service and Privacy Policy.')
      return
    }
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
    await continueAfterAuth(plan, promoCode, next)
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

      <label className="flex items-start gap-2 mt-4 text-xs text-slate-500 dark:text-zinc-400 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => { setAgreed(e.target.checked); if (e.target.checked) setError(null) }}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 dark:border-zinc-700"
        />
        <span>
          I've read and agree to Bario's{' '}
          <a href="/terms" target="_blank" className="underline">Terms of Service</a>{' '}
          (including that free/badged hosting is for static sites — features needing a server, database,
          or backend of their own require a separate VPS) and{' '}
          <a href="/privacy" target="_blank" className="underline">Privacy Policy</a>.
        </span>
      </label>

      {error && <p className="text-sm text-red-500 dark:text-red-400 mt-3">{error}</p>}
      <button
        type="submit"
        disabled={loading || !agreed}
        className="w-full mt-6 px-4 py-2 rounded-xl font-semibold bg-[#f59e0b] text-[#1a1200] disabled:opacity-60"
      >
        {loading ? 'Creating account…' : 'Sign up'}
      </button>
      <div className="flex items-center gap-3 mt-6">
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
        <span className="text-xs text-slate-400 dark:text-zinc-500">or</span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
      </div>
      <GoogleSignInButton plan={plan} promoCode={promoCode} next={next} label="Continue with Google" disabled={!agreed} />
      <p className="text-sm text-slate-500 dark:text-zinc-400 mt-4 text-center">
        Already have an account?{' '}
        <a
          href={`/login?${new URLSearchParams({ ...(plan ? { plan } : {}), ...(promoCode ? { promo: promoCode } : {}), ...(next ? { next } : {}) }).toString()}`}
          className="text-amber-600 dark:text-[#f59e0b]"
        >
          Log in
        </a>
      </p>
    </form>
  )
}
