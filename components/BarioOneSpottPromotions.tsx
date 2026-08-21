'use client'

import { useEffect, useState } from 'react'

type Promo = { id: string; title: string; description: string | null; starts_at: string | null; ends_at: string | null; status: string; created_via: string }

const box = 'rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4'
const input = 'rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm'
const btnPrimary = 'rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2'

export default function BarioOneSpottPromotions() {
  const [promos, setPromos] = useState<Promo[] | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/bario-one/spott/promotions')
    const data = await res.json()
    setPromos(data.promotions ?? [])
  }

  useEffect(() => { load() }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/bario-one/spott/promotions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, description: description || undefined }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not create promotion'); return }
      setTitle('')
      setDescription('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (promos === null) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>

  return (
    <div>
      <form onSubmit={create} className={`${box} mb-4 flex flex-wrap gap-2`}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Promotion title…" className={`${input} flex-1 min-w-[200px]`} />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className={`${input} flex-1 min-w-[200px]`} />
        <button type="submit" disabled={busy} className={btnPrimary}>Create on Spott</button>
        {error && <p className="w-full text-xs text-red-500">{error}</p>}
      </form>

      {promos.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">No promotions yet.</p>
      ) : (
        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
          {promos.map((p) => (
            <div key={p.id} className="p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{p.title}</p>
                <span className="text-xs text-slate-500 dark:text-zinc-400">{p.status}{p.created_via === 'spott' ? ' · from Spott' : ''}</span>
              </div>
              {p.description && <p className="mt-1 text-sm text-slate-600 dark:text-zinc-300">{p.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
