'use client'

import { useState } from 'react'

type AuditResult = {
  url: string
  isWordPress: boolean
  pagesFound: number
  pagesFoundIsExact: boolean
  homepageLoadMs: number
  pluginsDetected: string[]
}

export default function SiteAuditTool() {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AuditResult | null>(null)

  async function handleAudit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim() || busy) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/public/site-audit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Audit failed')
      setResult(data)
    } catch (err: any) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <form onSubmit={handleAudit} className="flex flex-col sm:flex-row items-center gap-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="yourwebsite.com"
          disabled={busy}
          className="w-full sm:flex-1 px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 outline-none focus:border-cyan-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold bg-cyan-500 text-slate-950 disabled:opacity-50 whitespace-nowrap"
        >
          {busy ? 'Auditing…' : 'Run Free Audit'}
        </button>
      </form>

      {busy && <p className="text-sm text-slate-500 mt-3 text-center">Checking your site — this takes a few seconds.</p>}
      {error && <p className="text-sm text-red-400 mt-3 text-center">{error}</p>}

      {result && (
        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Platform</div>
            <div className="text-lg font-semibold text-white">
              {result.isWordPress ? 'WordPress detected' : "Doesn't look like WordPress — that's fine, migration works for other platforms too"}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Pages found</div>
              <div className="text-2xl font-bold text-cyan-400">
                {result.pagesFoundIsExact ? result.pagesFound : `${result.pagesFound}+`}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Homepage load time</div>
              <div className="text-2xl font-bold text-cyan-400">{(result.homepageLoadMs / 1000).toFixed(2)}s</div>
            </div>
          </div>

          {result.pluginsDetected.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Plugins detected ({result.pluginsDetected.length})</div>
              <div className="flex flex-wrap gap-2">
                {result.pluginsDetected.map((p) => (
                  <span key={p} className="text-xs px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300">{p}</span>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Each plugin is a piece of software that can have security bugs — one of them is usually how a WordPress
                site gets hacked. A static site has none of these running, so there's nothing there to exploit.
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-slate-800 flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-slate-400 max-w-xs">
              Bring all {result.pagesFoundIsExact ? result.pagesFound : `${result.pagesFound}+`} pages over automatically, live on your own bario.ca address in minutes.
            </p>
            <a href="/signup" className="px-5 py-2.5 rounded-xl font-semibold bg-cyan-500 text-slate-950 whitespace-nowrap">
              Migrate My Site
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
