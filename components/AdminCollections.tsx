'use client'

import { useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'

type Site = {
  id: string
  name: string
  subdomain: string | null
  custom_domain: string | null
  collection_status: string
  collection_note: string | null
  collection_updated_at: string | null
}

const STATUS_LABEL: Record<string, string> = {
  none: 'No action',
  reminder_sent: 'Strike 1 — Email reminder sent',
  warning_shown: 'Strike 2 — Dashboard popup showing',
  locked: 'Strike 3 — Site locked (maintenance page)',
}

export default function AdminCollections() {
  const [email, setEmail] = useState('')
  const [sites, setSites] = useState<Site[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busySiteId, setBusySiteId] = useState<string | null>(null)

  async function lookup() {
    setError(null)
    setSites(null)
    try {
      const res = await fetch(`/api/admin/users/collection-status?email=${encodeURIComponent(email)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to look up account')
      setSites(data.sites)
    } catch (err: any) {
      setError(err.message)
    }
  }

  async function setStatus(siteId: string, status: string) {
    setBusySiteId(siteId)
    setError(null)
    try {
      const res = await fetch('/api/admin/users/collection-status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update')
      setSites((prev) => (prev ? prev.map((s) => (s.id === siteId ? { ...s, collection_status: status, collection_updated_at: new Date().toISOString() } : s)) : prev))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusySiteId(null)
    }
  }

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Payment Collections</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
              A 3-strike escalation for sites built before payment is received — reminder email, then a dashboard popup,
              then the live site itself goes into maintenance mode. Nothing here charges anyone; it's purely about
              access enforcement.
            </p>
          </div>
          <ThemeToggle />
        </div>

        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="client@example.com"
            className="flex-1 rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#131b2a] px-3 py-2 text-sm"
          />
          <button onClick={lookup} className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2">
            Look up
          </button>
        </div>

        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

        {sites && sites.length === 0 && <p className="text-sm text-slate-500 dark:text-zinc-400">No sites found for this account.</p>}

        {sites?.map((site) => (
          <div key={site.id} className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">{site.name}</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400">{site.custom_domain ?? (site.subdomain ? `${site.subdomain}.bario.ca` : 'not published')}</p>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${site.collection_status === 'locked' ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300' : site.collection_status === 'none' ? 'bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400' : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'}`}>
                {STATUS_LABEL[site.collection_status] ?? site.collection_status}
              </span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setStatus(site.id, 'reminder_sent')}
                disabled={busySiteId === site.id}
                className="text-xs rounded-lg bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 disabled:opacity-50 px-3 py-1.5"
              >
                Strike 1: Send reminder email
              </button>
              <button
                onClick={() => setStatus(site.id, 'warning_shown')}
                disabled={busySiteId === site.id}
                className="text-xs rounded-lg bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 disabled:opacity-50 px-3 py-1.5"
              >
                Strike 2: Show dashboard popup
              </button>
              <button
                onClick={() => setStatus(site.id, 'locked')}
                disabled={busySiteId === site.id}
                className="text-xs rounded-lg bg-red-600 dark:bg-red-900 hover:bg-red-700 dark:hover:bg-red-800 text-white disabled:opacity-50 px-3 py-1.5"
              >
                Strike 3: Lock site (maintenance)
              </button>
              {site.collection_status !== 'none' && (
                <button
                  onClick={() => setStatus(site.id, 'none')}
                  disabled={busySiteId === site.id}
                  className="text-xs rounded-lg bg-emerald-600 dark:bg-emerald-900 hover:bg-emerald-700 dark:hover:bg-emerald-800 text-white disabled:opacity-50 px-3 py-1.5"
                >
                  Clear (paid / resolved)
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
