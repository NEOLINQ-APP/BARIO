'use client'

import { useState } from 'react'

type MigrateResult = {
  siteId: string
  subdomain: string
  url: string
  pagesImported: number
  imagesRehosted: number
  failedPages: string[]
  externalAssetDomains: string[]
}

export default function MigrateSitePanel({ isPaid }: { isPaid: boolean }) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<MigrateResult | null>(null)

  async function handleMigrate(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim() || busy) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/sites/migrate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message ?? data.error ?? 'Migration failed')
      setResult(data)
    } catch (err: any) {
      setError(err.message)
    }
    setBusy(false)
  }

  if (!isPaid) {
    return (
      <div className="mt-8 rounded-2xl border border-zinc-800 bg-[#131b2a] p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold">Migrate an existing website</h2>
            <p className="text-xs text-zinc-500 mt-1 max-w-md">
              Already have a site somewhere else — WordPress, Wix, Squarespace, anything? Paste the URL and Bario brings
              it over automatically: every page, your images, live on your own bario.ca address in a couple of minutes.
            </p>
          </div>
          <a href="/#pricing" className="px-4 py-2 rounded-lg bg-[#f59e0b] text-[#1a1200] text-xs font-semibold whitespace-nowrap">
            Upgrade to unlock
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-8 rounded-2xl border border-zinc-800 bg-[#131b2a] p-6">
      <h2 className="text-sm font-semibold">Migrate an existing website</h2>
      <p className="text-xs text-zinc-500 mt-1 mb-4 max-w-md">
        Paste your current site's URL — Bario crawls every page, brings your images over, and publishes it on your own
        bario.ca address automatically.
      </p>

      <form onSubmit={handleMigrate} className="flex items-center gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="mybusiness.com"
          disabled={busy}
          className="flex-1 px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="px-4 py-2 rounded-lg bg-[#f59e0b] text-[#1a1200] text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
        >
          {busy ? 'Migrating…' : 'Migrate to Bario'}
        </button>
      </form>

      {busy && (
        <p className="text-xs text-zinc-500 mt-3">
          This can take a couple of minutes for larger sites — crawling every page and bringing your images over.
        </p>
      )}

      {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

      {result && (
        <div className="mt-4 rounded-xl border border-emerald-600/30 bg-emerald-500/5 p-4 text-xs space-y-2">
          <div className="font-semibold text-emerald-400">
            Migrated {result.pagesImported} page{result.pagesImported === 1 ? '' : 's'} — your site is live.
          </div>
          <div>
            <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-[#f59e0b] underline">
              {result.url.replace('https://', '')} ↗
            </a>
          </div>
          {result.imagesRehosted > 0 && (
            <div className="text-zinc-400">{result.imagesRehosted} image{result.imagesRehosted === 1 ? '' : 's'} brought over to your own storage.</div>
          )}
          {result.externalAssetDomains.length > 0 && (
            <div className="text-amber-400">
              Styling for this site still loads from {result.externalAssetDomains.join(', ')} — if that site ever goes
              offline, this page's layout could break even though the content itself is fully on Bario. Rebuilding it
              with Zeus removes that dependency entirely.
            </div>
          )}
          {result.failedPages.length > 0 && (
            <div className="text-zinc-500">
              Couldn't reach {result.failedPages.length} page{result.failedPages.length === 1 ? '' : 's'} — you can add those manually later.
            </div>
          )}
          <div className="pt-1">
            <a href={`/build?site=${result.siteId}`} className="text-[#f59e0b] underline">
              Open in editor
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
