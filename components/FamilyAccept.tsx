'use client'

import { useState } from 'react'

export default function FamilyAccept({ token }: { token: string }) {
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setStatus('busy')
    setError(null)
    try {
      const res = await fetch('/api/family/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Failed to accept invite')
      setStatus('done')
    } catch (err: any) {
      setError(err.message)
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <>
        <p className="text-sm text-emerald-400 mb-6">You're in! You now share the family storage plan.</p>
        <a href="/media" className="px-4 py-2 rounded-xl bg-[#f59e0b] text-[#1a1200] text-sm font-semibold">Go to Media Library</a>
      </>
    )
  }

  return (
    <>
      <p className="text-sm text-zinc-400 mb-6">Accept this invite to share the plan owner's storage — no extra cost.</p>
      {error && <p className="text-xs text-red-400 mb-4">{error}</p>}
      <button onClick={accept} disabled={status === 'busy'} className="px-5 py-2.5 rounded-xl bg-[#f59e0b] text-[#1a1200] text-sm font-semibold disabled:opacity-50">
        {status === 'busy' ? 'Joining…' : 'Accept Invite'}
      </button>
    </>
  )
}
