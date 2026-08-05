'use client'

import { useEffect, useState } from 'react'
import { VPS_TIERS, type VpsTierKey } from '@/lib/vpsTiers'

type VpsRow = {
  id: string
  tier: string
  billing_cycle: string
  app_type: string
  region: string
  hostname: string | null
  primary_ipv4: string | null
  primary_ipv6: string | null
  status: string
  backup_addon: boolean
  has_password_pending: boolean
  wp_admin_user: string | null
  has_wp_password_pending: boolean
  wp_domain: string | null
  wp_cert_issued_at: string | null
  created_at: string
}

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  provisioning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  awaiting_provision: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  pending_payment: 'bg-slate-200/60 dark:bg-zinc-700/50 text-slate-500 dark:text-zinc-400',
  pending_review: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  past_due: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  suspended: 'bg-red-500/10 text-red-600 dark:text-red-400',
  canceled_pending_deprovision: 'bg-red-500/10 text-red-600 dark:text-red-400',
  deprovisioned: 'bg-slate-200/60 dark:bg-zinc-700/50 text-slate-500 dark:text-zinc-400',
  provision_failed: 'bg-red-500/10 text-red-600 dark:text-red-400',
  rejected: 'bg-slate-200/60 dark:bg-zinc-700/50 text-slate-500 dark:text-zinc-400',
}
const STATUS_LABEL: Record<string, string> = {
  active: '🟢 Active',
  provisioning: '🟡 Setting up…',
  awaiting_provision: '🟡 Setting up…',
  pending_payment: '⚪ Awaiting payment',
  pending_review: '🟡 Under review',
  past_due: '🟡 Payment past due',
  suspended: '🔴 Suspended',
  canceled_pending_deprovision: '🔴 Canceling…',
  deprovisioned: '⚪ Removed',
  provision_failed: '🔴 Setup failed — contact support',
  rejected: '⚪ Rejected',
}

export default function VpsList() {
  const [instances, setInstances] = useState<VpsRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [revealingId, setRevealingId] = useState<string | null>(null)
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, string>>({})
  const [revealingWpId, setRevealingWpId] = useState<string | null>(null)
  const [revealedWpPasswords, setRevealedWpPasswords] = useState<Record<string, { username: string; password: string }>>({})
  const [domainInputs, setDomainInputs] = useState<Record<string, string>>({})
  const [issuingCertId, setIssuingCertId] = useState<string | null>(null)
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [convertResults, setConvertResults] = useState<Record<string, { pagesImported: number; url: string }>>({})
  const [payingId, setPayingId] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      const res = await fetch('/api/vps')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load servers')
      setInstances(data.instances)
    } catch (err: any) {
      setError(err.message)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleReveal(id: string) {
    if (!confirm('This shows your root password once — make sure to save it somewhere safe. Continue?')) return
    setRevealingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/vps/${id}/reveal-password`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reveal password')
      setRevealedPasswords((prev) => ({ ...prev, [id]: data.password }))
      await load()
    } catch (err: any) {
      setError(err.message)
    }
    setRevealingId(null)
  }

  async function handleRevealWp(id: string) {
    if (!confirm('This shows your WordPress admin password once — make sure to save it somewhere safe. Continue?')) return
    setRevealingWpId(id)
    setError(null)
    try {
      const res = await fetch(`/api/vps/${id}/reveal-wp-password`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to reveal password')
      setRevealedWpPasswords((prev) => ({ ...prev, [id]: { username: data.username, password: data.password } }))
      await load()
    } catch (err: any) {
      setError(err.message)
    }
    setRevealingWpId(null)
  }

  async function handleIssueCert(id: string) {
    const domain = (domainInputs[id] ?? '').trim()
    if (!domain) return
    setIssuingCertId(id)
    setError(null)
    try {
      const res = await fetch(`/api/vps/${id}/issue-cert`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ domain }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to issue certificate')
      await load()
    } catch (err: any) {
      setError(err.message)
    }
    setIssuingCertId(null)
  }

  async function handleConvertPreview(id: string, liveUrl: string) {
    setConvertingId(id)
    setError(null)
    try {
      const res = await fetch('/api/sites/migrate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: liveUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to preview static conversion')
      setConvertResults((prev) => ({ ...prev, [id]: { pagesImported: data.pagesImported, url: data.url } }))
    } catch (err: any) {
      setError(err.message)
    }
    setConvertingId(null)
  }

  async function handleConvertConfirm(id: string) {
    setPayingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/vps/${id}/convert-to-static`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Failed to start checkout')
      window.location.href = data.url
    } catch (err: any) {
      setError(err.message)
      setPayingId(null)
    }
  }

  if (!instances) return <p className="text-sm text-slate-500 dark:text-zinc-500">Loading your servers…</p>

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

      {instances.length === 0 && <p className="text-sm text-slate-500 dark:text-zinc-500">No servers yet.</p>}

      {instances.map((vps) => {
        const spec = VPS_TIERS[vps.tier as VpsTierKey]
        return (
          <div
            key={vps.id}
            className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-transparent p-4 hover:border-slate-300 dark:hover:border-zinc-700 transition-colors"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold capitalize">{vps.tier} VPS</span>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${STATUS_STYLE[vps.status] ?? 'bg-slate-200/60 dark:bg-zinc-700/50 text-slate-500 dark:text-zinc-400'}`}>
                    {STATUS_LABEL[vps.status] ?? vps.status}
                  </span>
                  {vps.backup_addon && (
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">Backups on</span>
                  )}
                </div>
                <div className="text-xs text-slate-500 dark:text-zinc-500 mt-1 truncate">
                  {vps.hostname && <>{vps.hostname}</>}
                  {vps.primary_ipv4 && <> · {vps.primary_ipv4}</>}
                  {' · '}{vps.billing_cycle}
                </div>
              </div>
            </div>

            {spec && (
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="text-[11px] font-mono px-2 py-1 rounded-md bg-slate-100 dark:bg-zinc-800/80 text-slate-600 dark:text-zinc-400">
                  {spec.vcpu} vCPU
                </span>
                <span className="text-[11px] font-mono px-2 py-1 rounded-md bg-slate-100 dark:bg-zinc-800/80 text-slate-600 dark:text-zinc-400">
                  {spec.ramGb} GB RAM
                </span>
                <span className="text-[11px] font-mono px-2 py-1 rounded-md bg-slate-100 dark:bg-zinc-800/80 text-slate-600 dark:text-zinc-400">
                  {spec.diskGb} GB NVMe
                </span>
              </div>
            )}

            {vps.status === 'active' && vps.has_password_pending && (
              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-zinc-800">
                {revealedPasswords[vps.id] ? (
                  <div className="text-xs">
                    <span className="text-slate-500 dark:text-zinc-400">Root password: </span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 select-all">{revealedPasswords[vps.id]}</span>
                    <p className="text-slate-500 dark:text-zinc-500 mt-1">Save this now — it won't be shown again.</p>
                  </div>
                ) : (
                  <button
                    onClick={() => handleReveal(vps.id)}
                    disabled={revealingId === vps.id}
                    className="text-xs text-amber-600 dark:text-[#f59e0b] underline disabled:opacity-50"
                  >
                    {revealingId === vps.id ? 'Revealing…' : 'Reveal root password (one-time)'}
                  </button>
                )}
              </div>
            )}

            {vps.status === 'active' && vps.app_type === 'wordpress' && (
              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-zinc-800 space-y-3">
                <div className="text-xs font-semibold text-slate-600 dark:text-zinc-300">WordPress</div>

                {vps.has_wp_password_pending ? (
                  <button
                    onClick={() => handleRevealWp(vps.id)}
                    disabled={revealingWpId === vps.id}
                    className="text-xs text-amber-600 dark:text-[#f59e0b] underline disabled:opacity-50"
                  >
                    {revealingWpId === vps.id ? 'Revealing…' : 'Reveal WordPress admin login (one-time)'}
                  </button>
                ) : revealedWpPasswords[vps.id] ? (
                  <div className="text-xs">
                    <span className="text-slate-500 dark:text-zinc-400">Admin login: </span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 select-all">
                      {revealedWpPasswords[vps.id].username} / {revealedWpPasswords[vps.id].password}
                    </span>
                    <p className="text-slate-500 dark:text-zinc-500 mt-1">Save this now — it won't be shown again.</p>
                  </div>
                ) : null}

                {vps.wp_domain && vps.wp_cert_issued_at ? (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    Live at <a href={`https://${vps.wp_domain}`} target="_blank" rel="noopener noreferrer" className="underline">{vps.wp_domain}</a>
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={domainInputs[vps.id] ?? ''}
                      onChange={(e) => setDomainInputs((prev) => ({ ...prev, [vps.id]: e.target.value }))}
                      placeholder="yourdomain.com"
                      className="px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-xs font-mono"
                    />
                    <button
                      onClick={() => handleIssueCert(vps.id)}
                      disabled={issuingCertId === vps.id || !(domainInputs[vps.id] ?? '').trim()}
                      className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-zinc-700 font-semibold disabled:opacity-50"
                    >
                      {issuingCertId === vps.id ? 'Issuing…' : 'Issue HTTPS certificate'}
                    </button>
                    <p className="w-full text-[11px] text-slate-500 dark:text-zinc-500">
                      Point your domain's A record at {vps.primary_ipv4} first, then enter it here.
                    </p>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200 dark:border-zinc-800">
                  {convertResults[vps.id] ? (
                    <div className="text-xs space-y-1.5">
                      <p className="text-emerald-600 dark:text-emerald-400">
                        Preview ready — {convertResults[vps.id].pagesImported} page{convertResults[vps.id].pagesImported === 1 ? '' : 's'} imported to{' '}
                        <a href={convertResults[vps.id].url} target="_blank" rel="noopener noreferrer" className="underline">{convertResults[vps.id].url}</a>.
                        Review it, then confirm below.
                      </p>
                      <button
                        onClick={() => handleConvertConfirm(vps.id)}
                        disabled={payingId === vps.id}
                        className="text-xs px-3 py-1.5 rounded-lg bg-[#f59e0b] text-[#1a1200] font-semibold disabled:opacity-50"
                      >
                        {payingId === vps.id ? 'Redirecting…' : 'Looks good — pay $10 CAD & cancel WordPress hosting'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleConvertPreview(vps.id, vps.wp_domain ? `https://${vps.wp_domain}` : `http://${vps.primary_ipv4}`)}
                      disabled={convertingId === vps.id}
                      className="text-xs text-slate-500 dark:text-zinc-400 underline disabled:opacity-50"
                    >
                      {convertingId === vps.id ? 'Converting…' : 'Done building? Convert to static hosting & cancel this server'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {vps.status === 'provision_failed' && (
              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-zinc-800 text-xs text-slate-500 dark:text-zinc-500">
                Something went wrong setting this up — our team's been notified. Contact support if this doesn't resolve soon.
              </div>
            )}
          </div>
        )
      })}

      <a
        href="/dashboard/servers/new"
        className="block w-full text-center px-4 py-3 rounded-xl border border-dashed border-slate-300 dark:border-zinc-700 text-sm font-semibold text-slate-600 dark:text-zinc-300 hover:border-slate-400 dark:hover:border-zinc-600 transition-colors"
      >
        + Order a new server
      </a>
      <p className="text-xs text-slate-500 dark:text-zinc-500 text-center">
        Manage billing or cancel a server anytime from <a href="/dashboard/billing" className="underline">Billing</a>.
      </p>
    </div>
  )
}
