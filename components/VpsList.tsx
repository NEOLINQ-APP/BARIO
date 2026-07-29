'use client'

import { useEffect, useState } from 'react'
import { VPS_TIERS, type VpsTierKey } from '@/lib/vpsTiers'

type VpsRow = {
  id: string
  tier: string
  billing_cycle: string
  region: string
  hostname: string | null
  primary_ipv4: string | null
  primary_ipv6: string | null
  status: string
  backup_addon: boolean
  has_password_pending: boolean
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
