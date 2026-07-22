'use client'

import { useState } from 'react'

type Result = { domain: string; availability: 'available' | 'taken' | 'unknown' } | null

export default function DomainChecker() {
  const [domain, setDomain] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result>(null)

  async function handleCheck(e: React.FormEvent) {
    e.preventDefault()
    if (!domain.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch(`/api/domains/check?domain=${encodeURIComponent(domain.trim().toLowerCase())}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to check domain')
      setResult(data)
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="max-w-xl mx-auto">
      <form onSubmit={handleCheck} className="flex flex-col sm:flex-row items-stretch gap-2">
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="Search a domain, e.g. myrestaurant.com"
          className="flex-1 px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-cyan-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm transition-all disabled:opacity-60"
        >
          {loading ? 'Checking…' : 'Check availability'}
        </button>
      </form>

      {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

      {result && (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-sm text-left">
          {result.availability === 'available' && (
            <>
              <p className="text-emerald-400 font-semibold">🎉 {result.domain} looks available.</p>
              <p className="text-slate-400 mt-1">
                Domain registration through Bario is coming soon. Sign up now to build your site, and connect it the moment it's ready.
              </p>
              <a href="/signup" className="inline-block mt-3 text-cyan-400 underline font-semibold">Sign up free →</a>
            </>
          )}
          {result.availability === 'taken' && (
            <>
              <p className="text-amber-400 font-semibold">{result.domain} is already registered.</p>
              <p className="text-slate-400 mt-1">Already own it? You can connect it to a Bario site today.</p>
              <a href="/signup" className="inline-block mt-3 text-cyan-400 underline font-semibold">Sign up & connect your domain →</a>
            </>
          )}
          {result.availability === 'unknown' && (
            <p className="text-slate-400">Couldn't check that domain right now — try again in a moment.</p>
          )}
        </div>
      )}
    </div>
  )
}
