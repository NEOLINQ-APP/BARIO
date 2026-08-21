'use client'

import { useEffect, useState } from 'react'

type Listing = {
  id: string
  name: string
  public_url: string | null
  sync_status: string
  description: string | null
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
  last_synced_at: string | null
}

const box = 'rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4'
const input = 'w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm'
const btnPrimary = 'rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2'

const SYNC_LABEL: Record<string, string> = {
  synced: 'Synced',
  pending: 'Update pending — waiting for Spott to confirm',
  conflict: 'Conflict — needs manual review',
  error: 'Sync error',
}

export default function BarioOneSpottMyListing() {
  const [listing, setListing] = useState<Listing | null | undefined>(undefined)
  const [form, setForm] = useState({ description: '', phone: '', email: '', website: '', address: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/bario-one/spott/connect')
    const data = await res.json()
    setListing(data.listing ?? null)
    if (data.listing) {
      setForm({
        description: data.listing.description || '',
        phone: data.listing.phone || '',
        email: data.listing.email || '',
        website: data.listing.website || '',
        address: data.listing.address || '',
      })
    }
  }

  useEffect(() => { load() }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/bario-one/spott/listing', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) { setMsg(data.error || 'Could not save'); return }
      setMsg(data.note || 'Sent.')
      await load()
    } finally {
      setSaving(false)
    }
  }

  if (listing === undefined) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
  if (!listing) return <p className="text-sm text-slate-500 dark:text-zinc-400">No Spott listing connected yet — connect one from the Spott overview page.</p>

  return (
    <div className={box}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{listing.name}</p>
          {listing.public_url && <a href={listing.public_url} target="_blank" rel="noreferrer" className="text-xs text-amber-600 hover:underline">{listing.public_url}</a>}
        </div>
        <span className="text-xs text-slate-500 dark:text-zinc-400">{SYNC_LABEL[listing.sync_status] || listing.sync_status}</span>
      </div>
      <form onSubmit={save} className="space-y-3">
        <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows={3} className={input} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className={input} />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className={input} />
          <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="Website" className={input} />
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" className={input} />
        </div>
        <button type="submit" disabled={saving} className={btnPrimary}>Save to Spott</button>
        {msg && <p className="text-xs text-slate-500 dark:text-zinc-400">{msg}</p>}
      </form>
    </div>
  )
}
