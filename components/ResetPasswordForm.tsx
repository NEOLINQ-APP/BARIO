'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import PasswordInput from '@/components/PasswordInput'

export default function ResetPasswordForm() {
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reset password')
      setDone(true)
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  if (!token) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#131b2a] p-8 text-center">
        <p className="text-sm text-red-400">Missing reset token. Use the link from your email.</p>
      </div>
    )
  }

  if (done) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#131b2a] p-8 text-center">
        <h1 className="text-xl font-bold mb-2">Password updated</h1>
        <a href="/login" className="text-[#f59e0b] text-sm">Log in with your new password</a>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#131b2a] p-8">
      <h1 className="text-2xl font-bold mb-6">Set a new password</h1>
      <PasswordInput value={password} onChange={setPassword} minLength={8} />
      {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full mt-6 px-4 py-2 rounded-xl font-semibold bg-[#f59e0b] text-[#1a1200] disabled:opacity-60"
      >
        {loading ? 'Saving…' : 'Reset Password'}
      </button>
    </form>
  )
}
