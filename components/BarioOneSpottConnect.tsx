'use client'

import { useEffect, useState } from 'react'

type Listing = {
  id: string
  name: string
  public_url: string | null
  sync_status: 'not_connected' | 'pending' | 'synced' | 'conflict' | 'error'
  last_synced_at: string | null
  external_spott_id: string | null
}

type SearchResult = { id: string; name: string; city: string | null; province: string | null; address: string | null; is_claimed: boolean }

const box = 'rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4'
const input = 'rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm'
const btnPrimary = 'rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2'
const btnSecondary = 'rounded-lg border border-slate-300 dark:border-zinc-700 text-sm font-medium px-4 py-2 hover:bg-slate-50 dark:hover:bg-zinc-800'

export default function BarioOneSpottConnect() {
  const [listing, setListing] = useState<Listing | null | undefined>(undefined)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [newBiz, setNewBiz] = useState({ name: '', city: '', province: '', address: '', phone: '', email: '', website: '' })

  async function load() {
    const res = await fetch('/api/bario-one/spott/connect')
    const data = await res.json()
    setListing(data.listing ?? null)
  }

  useEffect(() => { load() }, [])

  async function search(e: React.FormEvent) {
    e.preventDefault()
    if (q.trim().length < 2) return
    setSearching(true)
    setError(null)
    try {
      const res = await fetch('/api/bario-one/spott/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q }) })
      const data = await res.json()
      setResults(data.results ?? [])
    } finally {
      setSearching(false)
    }
  }

  async function requestConnect(biz: SearchResult) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/bario-one/spott/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ business_id: biz.id, business_name: biz.name }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not request connection'); return }
      setRequestId(data.request_id)
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function exchangeCode(e: React.FormEvent) {
    e.preventDefault()
    if (!requestId && !listing) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/bario-one/spott/connect/exchange', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ request_id: requestId, code: code.trim() }) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not exchange code'); return }
      setCode('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function createNew(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/bario-one/spott/connect/provision', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(newBiz) })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not create the listing'); return }
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect this Spott listing? BARIO will stop receiving leads/reviews from it.')) return
    setBusy(true)
    try {
      await fetch('/api/bario-one/spott/disconnect', { method: 'POST' })
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (listing === undefined) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>

  if (listing && listing.sync_status === 'synced') {
    return (
      <div className={box}>
        <p className="text-sm font-medium">{listing.name}</p>
        {listing.public_url && <a href={listing.public_url} target="_blank" rel="noreferrer" className="text-xs text-amber-600 hover:underline">{listing.public_url}</a>}
        <p className="mt-2 text-xs text-slate-500 dark:text-zinc-400">
          Connected{listing.last_synced_at ? ` · last synced ${new Date(listing.last_synced_at).toLocaleString()}` : ''}
        </p>
        <button onClick={disconnect} disabled={busy} className={`${btnSecondary} mt-4`}>Disconnect</button>
      </div>
    )
  }

  if (listing && listing.sync_status === 'pending') {
    return (
      <div className={box}>
        <p className="text-sm font-medium">Waiting on approval</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">
          {listing.name} — the real owner of this Spott listing needs to approve the request from their email, then give you the code they receive.
        </p>
        <form onSubmit={exchangeCode} className="mt-3 flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="8-character code" className={`${input} font-mono tracking-widest`} maxLength={16} />
          <button type="submit" disabled={busy || !code.trim()} className={btnPrimary}>Connect</button>
        </form>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className={box}>
        <p className="text-sm font-medium">Connect an existing Spott listing</p>
        <form onSubmit={search} className="mt-3 flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by business name or city…" className={`${input} flex-1`} />
          <button type="submit" disabled={searching} className={btnPrimary}>Search</button>
        </form>
        {results && (
          <div className="mt-3 divide-y divide-slate-200 dark:divide-zinc-800">
            {results.length === 0 && <p className="py-2 text-xs text-slate-500 dark:text-zinc-400">No matches.</p>}
            {results.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{r.name}</p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">{[r.city, r.province].filter(Boolean).join(', ')}{r.is_claimed ? ' · claimed' : ' · unclaimed'}</p>
                </div>
                <button onClick={() => requestConnect(r)} disabled={busy} className={btnSecondary}>Request connection</button>
              </div>
            ))}
          </div>
        )}
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </div>

      <div className={box}>
        <button onClick={() => setShowNew((v) => !v)} className="text-sm font-medium text-amber-600 hover:underline">
          {showNew ? 'Cancel' : "Don't see your business? Create a new Spott listing →"}
        </button>
        {showNew && (
          <form onSubmit={createNew} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input required value={newBiz.name} onChange={(e) => setNewBiz({ ...newBiz, name: e.target.value })} placeholder="Business name" className={`${input} sm:col-span-2`} />
            <input required value={newBiz.city} onChange={(e) => setNewBiz({ ...newBiz, city: e.target.value })} placeholder="City" className={input} />
            <input required value={newBiz.province} onChange={(e) => setNewBiz({ ...newBiz, province: e.target.value })} placeholder="Province" className={input} />
            <input value={newBiz.address} onChange={(e) => setNewBiz({ ...newBiz, address: e.target.value })} placeholder="Address (optional)" className={`${input} sm:col-span-2`} />
            <input value={newBiz.phone} onChange={(e) => setNewBiz({ ...newBiz, phone: e.target.value })} placeholder="Phone (optional)" className={input} />
            <input value={newBiz.email} onChange={(e) => setNewBiz({ ...newBiz, email: e.target.value })} placeholder="Email (optional)" className={input} />
            <input value={newBiz.website} onChange={(e) => setNewBiz({ ...newBiz, website: e.target.value })} placeholder="Website (optional)" className={`${input} sm:col-span-2`} />
            <button type="submit" disabled={busy} className={`${btnPrimary} sm:col-span-2`}>Create listing on Spott</button>
          </form>
        )}
        {error && showNew && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </div>
    </div>
  )
}
