'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export default function VerifyEmailPanel() {
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setError('Missing verification token. Use the link from your email.')
      return
    }
    ;(async () => {
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Verification failed')
        setStatus('ok')
      } catch (err: any) {
        setStatus('error')
        setError(err.message)
      }
    })()
  }, [token])

  return (
    <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-[#131b2a] p-8 text-center">
      {status === 'checking' && <p className="text-sm text-zinc-400">Verifying your email…</p>}
      {status === 'ok' && (
        <>
          <h1 className="text-xl font-bold mb-2">Email verified</h1>
          <p className="text-sm text-zinc-400 mb-4">You're all set.</p>
          <a href="/dashboard" className="text-[#f59e0b] text-sm">Go to your dashboard →</a>
        </>
      )}
      {status === 'error' && (
        <>
          <h1 className="text-xl font-bold mb-2">Couldn't verify</h1>
          <p className="text-sm text-red-400 mb-4">{error}</p>
          <a href="/dashboard" className="text-[#f59e0b] text-sm">Back to your dashboard →</a>
        </>
      )}
    </div>
  )
}
