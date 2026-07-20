'use client'

import { useEffect, useState } from 'react'

type Code = {
  id: string
  code: string
  credits: number
  note: string
  max_redemptions: number | null
  redemption_count: number
  expires_at: string | null
  is_active: boolean
}

export default function AdminGiftCodes() {
  const [codes, setCodes] = useState<Code[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const [customCode, setCustomCode] = useState('')
  const [credits, setCredits] = useState('50')
  const [note, setNote] = useState('')
  const [maxRedemptions, setMaxRedemptions] = useState('')
  const [expiresInDays, setExpiresInDays] = useState('')

  function load() {
    fetch('/api/admin/gift-codes')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setCodes(data.codes)
      })
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/gift-codes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code: customCode || undefined,
          credits,
          note,
          maxRedemptions: maxRedemptions || undefined,
          expiresInDays: expiresInDays || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create code')
      setCustomCode('')
      setNote('')
      setMaxRedemptions('')
      setExpiresInDays('')
      load()
    } catch (err: any) {
      setError(err.message)
    }
    setCreating(false)
  }

  async function handleDeactivate(id: string) {
    await fetch(`/api/admin/gift-codes/${id}/deactivate`, { method: 'POST' })
    load()
  }

  return (
    <main className="min-h-screen bg-[#0b111c] text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-2">
          <a href="/admin" className="text-sm text-zinc-400 hover:text-zinc-200">← Admin</a>
        </div>
        <h1 className="text-2xl font-bold">Gift & Promo Credit Codes</h1>
        <p className="text-sm text-zinc-400 mt-1">Users enter these on their dashboard to receive free AI-builder credits.</p>

        <form onSubmit={handleCreate} className="mt-6 rounded-2xl border border-zinc-800 bg-[#131b2a] p-6 space-y-3">
          <h2 className="text-sm font-semibold">Create a new code</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Code (blank = auto-generate)</label>
              <input value={customCode} onChange={(e) => setCustomCode(e.target.value)} placeholder="e.g. LAUNCH50" className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Credits to grant</label>
              <input value={credits} onChange={(e) => setCredits(e.target.value)} type="number" min="1" required className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Max redemptions (blank = unlimited)</label>
              <input value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} type="number" min="1" className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Expires in days (blank = never)</label>
              <input value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} type="number" min="1" className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Note (internal, e.g. "Instagram giveaway Nov 2026")</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm" />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button type="submit" disabled={creating} className="px-4 py-2 rounded-lg bg-[#f59e0b] text-[#1a1200] text-xs font-semibold disabled:opacity-50">
            {creating ? 'Creating…' : 'Create Code'}
          </button>
        </form>

        <div className="mt-8 space-y-3">
          {codes?.map((c) => (
            <div key={c.id} className="rounded-xl border border-zinc-800 bg-[#131b2a] p-4 flex items-center justify-between gap-4">
              <div>
                <div className="font-mono font-semibold text-sm">{c.code}</div>
                <div className="text-xs text-zinc-400 mt-1">
                  {c.credits} credits · {c.redemption_count}{c.max_redemptions ? `/${c.max_redemptions}` : ''} redeemed
                  {c.expires_at && ` · expires ${new Date(c.expires_at).toLocaleDateString()}`}
                  {!c.is_active && ' · deactivated'}
                </div>
                {c.note && <div className="text-xs text-zinc-500 mt-1">{c.note}</div>}
              </div>
              {c.is_active && (
                <button onClick={() => handleDeactivate(c.id)} className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-400 text-xs font-semibold flex-shrink-0">
                  Deactivate
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
