'use client'

import { useState } from 'react'

type PreviewResult = {
  url: string
  isWordPress: boolean
}

// Public, no-login teaser widget — a real, full site audit (page count,
// load time, SEO/technical checks, and an AI-powered deep-dive report)
// now requires a free Bario account, at /site-audit. This stays as a
// zero-friction "is this WordPress?" check for top-of-funnel/shareable use.
export default function SiteAuditTool() {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PreviewResult | null>(null)

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
      if (!res.ok) throw new Error(data.error ?? 'Check failed')
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
          className="w-full sm:flex-1 px-4 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 outline-none focus:border-cyan-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !url.trim()}
          className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold bg-cyan-500 text-slate-950 disabled:opacity-50 whitespace-nowrap"
        >
          {busy ? 'Checking…' : 'Quick Check'}
        </button>
      </form>

      {busy && <p className="text-sm text-slate-500 mt-3 text-center">Checking your site…</p>}
      {error && <p className="text-sm text-red-500 dark:text-red-400 mt-3 text-center">{error}</p>}

      {result && (
        <div className="mt-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-6 space-y-5">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Platform</div>
            <div className="text-lg font-semibold text-slate-900 dark:text-white">
              {result.isWordPress ? 'WordPress detected' : "Doesn't look like WordPress"}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm">
              That's the free preview. A full account unlocks a real crawl of your whole site, real SEO/technical
              checks, and an AI report grounded in your actual content — the kind of specific analysis a generic
              chatbot can't produce, because it can't crawl your site itself.
            </p>
            <a href="/signup" className="px-5 py-2.5 rounded-xl font-semibold bg-cyan-500 text-slate-950 whitespace-nowrap">
              Get the Full Audit — Free
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
