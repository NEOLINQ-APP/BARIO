'use client'

import { useState } from 'react'

export default function PublishPanel({
  onClose,
  initialSubdomain,
  initialCustomDomain,
  initialDomainStatus,
  initialPublished,
}: {
  onClose: () => void
  initialSubdomain: string | null
  initialCustomDomain: string | null
  initialDomainStatus: string
  initialPublished: boolean
}) {
  const [subdomain, setSubdomain] = useState(initialSubdomain ?? '')
  const [published, setPublished] = useState(initialPublished)
  const [customDomain, setCustomDomain] = useState(initialCustomDomain ?? '')
  const [domainStatus, setDomainStatus] = useState(initialDomainStatus)
  const [instructions, setInstructions] = useState<{ a: any; cname: any } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSaveSubdomainAndPublish(nextPublished: boolean) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/sites/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subdomain, publish: nextPublished }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update')
      setPublished(data.is_published)
    } catch (err: any) {
      setError(err.message)
    }
    setBusy(false)
  }

  async function handleConnectDomain(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/sites/domain', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain: customDomain }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to connect domain')
      setDomainStatus('pending')
      setInstructions(data.instructions)
    } catch (err: any) {
      setError(err.message)
    }
    setBusy(false)
  }

  async function handleVerify() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/sites/domain/verify', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Verification check failed')
      setDomainStatus(data.verified ? 'verified' : 'pending')
      if (!data.verified) setError('Not verified yet — DNS changes can take a while to propagate. Try again shortly.')
    } catch (err: any) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#131b2a] p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Publish your site</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">✕</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Your bario.ca subdomain</label>
            <div className="flex items-center gap-2">
              <input
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.toLowerCase())}
                placeholder="mybusiness"
                className="flex-1 px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm"
              />
              <span className="text-sm text-zinc-500">.bario.ca</span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-zinc-800 p-3">
            <div>
              <div className="text-sm font-semibold">{published ? 'Live' : 'Not published'}</div>
              <div className="text-xs text-zinc-500">{published ? 'Your site is publicly visible' : 'Publish to go live'}</div>
            </div>
            <button
              onClick={() => handleSaveSubdomainAndPublish(!published)}
              disabled={busy || !subdomain}
              className="px-4 py-2 rounded-lg bg-[#f59e0b] text-[#1a1200] text-xs font-semibold disabled:opacity-50"
            >
              {published ? 'Unpublish' : 'Publish'}
            </button>
          </div>

          <div className="pt-4 border-t border-zinc-800">
            <label className="block text-xs text-zinc-400 mb-1">Connect your own domain (optional)</label>
            <form onSubmit={handleConnectDomain} className="flex items-center gap-2">
              <input
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value.toLowerCase())}
                placeholder="mybusiness.com"
                className="flex-1 px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm"
              />
              <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg border border-zinc-700 text-xs font-semibold disabled:opacity-50">
                Connect
              </button>
            </form>

            {domainStatus !== 'none' && (
              <div className="mt-3 rounded-lg border border-zinc-800 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span>
                    Status: <strong className={domainStatus === 'verified' ? 'text-emerald-400' : 'text-amber-400'}>{domainStatus}</strong>
                  </span>
                  {domainStatus !== 'verified' && (
                    <button onClick={handleVerify} disabled={busy} className="text-[#f59e0b] underline">
                      Check verification
                    </button>
                  )}
                </div>
                {instructions && (
                  <div className="mt-2 space-y-1 text-zinc-400">
                    <div>Add these DNS records at your registrar:</div>
                    <div className="font-mono">A @ → {instructions.a.value}</div>
                    <div className="font-mono">CNAME www → {instructions.cname.value}</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  )
}
