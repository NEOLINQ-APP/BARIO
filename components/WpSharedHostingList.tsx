'use client'

import { useEffect, useState } from 'react'
import { WP_SHARED_PRICE_CENTS_CAD } from '@/lib/wpSharedTiers'

type SiteRow = {
  id: string
  subdomain: string | null
  custom_domain: string | null
  domain_status: 'none' | 'pending' | 'verified'
  status: string
  wp_admin_user: string | null
  has_password_pending: boolean
  created_at: string
}

const STATUS_LABEL: Record<string, string> = {
  active: '🟢 Active',
  provisioning: '🟡 Setting up…',
  awaiting_provision: '🟡 Setting up…',
  awaiting_capacity: '🟡 Waiting for capacity — we\'ll notify you',
  pending_payment: '⚪ Awaiting payment',
  canceled_pending_deprovision: '🔴 Canceling…',
  deprovisioned: '⚪ Removed',
  provision_failed: '🔴 Setup failed — contact support',
}

function formatCad(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export default function WpSharedHostingList() {
  const [sites, setSites] = useState<SiteRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ordering, setOrdering] = useState(false)
  const [revealingId, setRevealingId] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Record<string, { username: string; password: string }>>({})
  const [domainInputs, setDomainInputs] = useState<Record<string, string>>({})
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [connectMsg, setConnectMsg] = useState<Record<string, string>>({})
  const [verifyingId, setVerifyingId] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      const res = await fetch('/api/wp-shared')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      setSites(data.sites)
    } catch (err: any) {
      setError(err.message)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleOrder() {
    setOrdering(true)
    setError(null)
    try {
      const res = await fetch('/api/wp-shared/configure', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create order')
      const checkoutRes = await fetch('/api/wp-shared/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: data.siteId }),
      })
      const checkoutData = await checkoutRes.json()
      if (!checkoutRes.ok || !checkoutData.url) throw new Error(checkoutData.error ?? 'Failed to start checkout')
      window.location.href = checkoutData.url
    } catch (err: any) {
      setError(err.message)
      setOrdering(false)
    }
  }

  async function handleReveal(id: string) {
    if (!confirm('This shows your WordPress admin password once — save it somewhere safe. Continue?')) return
    setRevealingId(id)
    try {
      const res = await fetch(`/api/wp-shared/${id}/reveal-password`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reveal password')
      setRevealed((prev) => ({ ...prev, [id]: { username: data.username, password: data.password } }))
      await load()
    } catch (err: any) {
      setError(err.message)
    }
    setRevealingId(null)
  }

  async function handleConnect(id: string) {
    const domain = (domainInputs[id] ?? '').trim()
    if (!domain) return
    setConnectingId(id)
    try {
      const res = await fetch(`/api/wp-shared/${id}/connect-domain`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to connect domain')
      setConnectMsg((prev) => ({ ...prev, [id]: data.message }))
      await load()
    } catch (err: any) {
      setError(err.message)
    }
    setConnectingId(null)
  }

  async function handleVerify(id: string) {
    setVerifyingId(id)
    try {
      const res = await fetch(`/api/wp-shared/${id}/verify-domain`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to verify domain')
      await load()
    } catch (err: any) {
      setError(err.message)
    }
    setVerifyingId(null)
  }

  if (!sites) return <p className="text-sm text-slate-500 dark:text-zinc-500">Loading…</p>

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

      {sites.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-zinc-700 p-6 text-center">
          <p className="text-sm text-slate-600 dark:text-zinc-300 mb-3">
            Shared WordPress Hosting — {formatCad(WP_SHARED_PRICE_CENTS_CAD)}/mo. WordPress, a real subdomain, and HTTPS, set up automatically.
          </p>
          <button
            onClick={handleOrder}
            disabled={ordering}
            className="px-4 py-2 rounded-xl bg-[#f59e0b] text-[#1a1200] font-semibold disabled:opacity-50"
          >
            {ordering ? 'Redirecting…' : `Get Shared WordPress Hosting — ${formatCad(WP_SHARED_PRICE_CENTS_CAD)}/mo`}
          </button>
        </div>
      )}

      {sites.map((site) => (
        <div key={site.id} className="rounded-xl border border-slate-200 dark:border-zinc-800 p-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="font-semibold">Shared WordPress Hosting</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200/60 dark:bg-zinc-700/50">{STATUS_LABEL[site.status] ?? site.status}</span>
          </div>

          {site.status === 'active' && site.subdomain && (
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-2">
              <a href={`https://${site.subdomain}`} target="_blank" rel="noopener noreferrer" className="underline">{site.subdomain}</a>
            </p>
          )}

          {site.status === 'active' && (
            <div className="mt-3 pt-3 border-t border-slate-200 dark:border-zinc-800 space-y-3">
              {site.has_password_pending ? (
                <button onClick={() => handleReveal(site.id)} disabled={revealingId === site.id} className="text-xs text-amber-600 dark:text-[#f59e0b] underline disabled:opacity-50">
                  {revealingId === site.id ? 'Revealing…' : 'Reveal WordPress admin login (one-time)'}
                </button>
              ) : revealed[site.id] ? (
                <div className="text-xs">
                  <span className="text-slate-500 dark:text-zinc-400">Admin login: </span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 select-all">{revealed[site.id].username} / {revealed[site.id].password}</span>
                </div>
              ) : null}

              {site.domain_status === 'verified' && site.custom_domain ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  Live at <a href={`https://${site.custom_domain}`} target="_blank" rel="noopener noreferrer" className="underline">{site.custom_domain}</a>
                </p>
              ) : site.domain_status === 'pending' && site.custom_domain ? (
                <div className="text-xs space-y-1.5">
                  <p className="text-slate-500 dark:text-zinc-400">{connectMsg[site.id] ?? `Waiting on DNS for ${site.custom_domain}.`}</p>
                  <button onClick={() => handleVerify(site.id)} disabled={verifyingId === site.id} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 font-semibold disabled:opacity-50">
                    {verifyingId === site.id ? 'Checking…' : 'Verify domain'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={domainInputs[site.id] ?? ''}
                    onChange={(e) => setDomainInputs((prev) => ({ ...prev, [site.id]: e.target.value }))}
                    placeholder="yourdomain.com"
                    className="px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-xs font-mono"
                  />
                  <button
                    onClick={() => handleConnect(site.id)}
                    disabled={connectingId === site.id || !(domainInputs[site.id] ?? '').trim()}
                    className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 font-semibold disabled:opacity-50"
                  >
                    {connectingId === site.id ? 'Connecting…' : 'Use my own domain'}
                  </button>
                </div>
              )}
            </div>
          )}

          {site.status === 'provision_failed' && (
            <p className="mt-3 pt-3 border-t border-slate-200 dark:border-zinc-800 text-xs text-slate-500 dark:text-zinc-500">
              Something went wrong setting this up — our team's been notified.
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
