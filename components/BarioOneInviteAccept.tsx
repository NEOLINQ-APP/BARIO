'use client'

import { useEffect, useState } from 'react'

export default function BarioOneInviteAccept({ token }: { token: string }) {
  const [status, setStatus] = useState<'pending' | 'ok' | 'error'>('pending')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setError('Missing invite token')
      return
    }
    fetch('/api/bario-one/invite/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
        setStatus('ok')
      })
      .catch((err) => {
        setError(err.message)
        setStatus('error')
      })
  }, [token])

  if (status === 'pending') return <p className="text-sm text-slate-500 dark:text-zinc-400">Accepting invite…</p>

  if (status === 'error') {
    return (
      <div className="rounded-2xl border border-red-300 dark:border-red-900 bg-white dark:bg-[#131b2a] p-6">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-6 space-y-3">
      <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">You've joined the organization.</p>
      <a href="/dashboard/bario-one" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline">
        Go to Bario One →
      </a>
    </div>
  )
}
