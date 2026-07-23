'use client'

import { useEffect, useState } from 'react'

type Site = {
  id: string
  name: string
  subdomain: string | null
  custom_domain: string | null
  domain_status: string
  is_published: boolean
  content_mode: 'sections' | 'template'
  updated_at: string
}

export default function SitesList() {
  const [sites, setSites] = useState<Site[] | null>(null)
  const [limit, setLimit] = useState<number | null>(1)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      const res = await fetch('/api/sites')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load sites')
      setSites(data.sites)
      setLimit(data.limit)
    } catch (err: any) {
      setError(err.message)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate() {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/sites', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create site')
      window.location.href = `/build?site=${data.id}`
    } catch (err: any) {
      setError(err.message)
      setCreating(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This unpublishes it and disconnects any custom domain — this can't be undone.`)) return
    setDeletingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/sites/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to delete site')
      await load()
    } catch (err: any) {
      setError(err.message)
    }
    setDeletingId(null)
  }

  if (!sites) return <p className="text-sm text-zinc-500">Loading your sites…</p>

  const atLimit = limit !== null && sites.length >= limit

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-400">{error}</p>}

      {sites.length === 0 && <p className="text-sm text-zinc-500">No sites yet.</p>}

      {sites.map((site) => (
        <div key={site.id} className="flex items-center justify-between rounded-xl border border-zinc-800 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold truncate">{site.name}</span>
              <span
                className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${
                  site.is_published ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-700/50 text-zinc-400'
                }`}
              >
                {site.is_published ? '🟢 Live' : '⚪ Draft'}
              </span>
            </div>
            <div className="text-xs text-zinc-500 mt-1 truncate">
              {site.custom_domain ? (
                <>
                  {site.custom_domain}{' '}
                  <span className={site.domain_status === 'verified' ? 'text-emerald-400' : 'text-amber-400'}>
                    {site.domain_status === 'verified' ? '· connected' : '· 🟡 DNS pending'}
                  </span>
                </>
              ) : site.subdomain ? (
                `${site.subdomain}.bario.ca`
              ) : (
                'Not published yet'
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-4">
            <a href={`/build?site=${site.id}`} className="text-sm text-[#f59e0b] font-semibold">
              Edit
            </a>
            <button
              onClick={() => handleDelete(site.id, site.name)}
              disabled={deletingId === site.id}
              className="text-xs text-red-400 underline disabled:opacity-50"
            >
              {deletingId === site.id ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      ))}

      <button
        onClick={handleCreate}
        disabled={creating || atLimit}
        className="w-full px-4 py-3 rounded-xl border border-dashed border-zinc-700 text-sm font-semibold text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {creating ? 'Creating…' : atLimit ? `Your plan allows ${limit} site${limit === 1 ? '' : 's'} — upgrade for more` : '+ Add a new site'}
      </button>
      {atLimit && (
        <a href="/#pricing" className="block text-center text-xs text-[#f59e0b] underline">
          View plans
        </a>
      )}
    </div>
  )
}
