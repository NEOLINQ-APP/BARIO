'use client'

import { useState } from 'react'

export default function ResendVerificationButton() {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setState('sending')
    setError(null)
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to resend')
      setState('sent')
    } catch (err: any) {
      setError(err.message)
      setState('idle')
    }
  }

  if (state === 'sent') {
    return <p className="text-sm text-emerald-400">Verification email sent — check your inbox.</p>
  }

  return (
    <div>
      <button onClick={handleClick} disabled={state === 'sending'} className="text-[#f59e0b] underline text-sm disabled:opacity-60">
        {state === 'sending' ? 'Sending…' : 'Resend verification email'}
      </button>
      {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
    </div>
  )
}
