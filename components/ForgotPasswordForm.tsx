'use client'

import { useState } from 'react'

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setSent(true)
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#131b2a] p-8 text-center">
        <h1 className="text-xl font-bold mb-2">Check your email</h1>
        <p className="text-sm text-zinc-400">If an account exists for that email, a reset link is on its way.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#131b2a] p-8">
      <h1 className="text-2xl font-bold mb-1">Forgot your password?</h1>
      <p className="text-sm text-zinc-400 mb-6">Enter your email and we'll send you a reset link.</p>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-zinc-100"
      />
      {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full mt-6 px-4 py-2 rounded-xl font-semibold bg-[#f59e0b] text-[#1a1200] disabled:opacity-60"
      >
        {loading ? 'Sending…' : 'Send reset link'}
      </button>
      <p className="text-sm text-zinc-400 mt-4 text-center">
        <a href="/login" className="text-[#f59e0b]">Back to log in</a>
      </p>
    </form>
  )
}
