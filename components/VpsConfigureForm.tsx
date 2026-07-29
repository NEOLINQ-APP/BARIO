'use client'

import { useState } from 'react'
import { VPS_TIERS, VPS_TIER_KEYS, BILLING_CYCLES, BILLING_CYCLE_KEYS, type VpsTierKey, type BillingCycle } from '@/lib/vpsTiers'
import { CURRENT_VPS_POLICY_VERSION } from '@/lib/legalVersion'

function formatCad(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export default function VpsConfigureForm() {
  const [tier, setTier] = useState<VpsTierKey>('small')
  const [cycle, setCycle] = useState<BillingCycle>('monthly')
  const [backupAddon, setBackupAddon] = useState(false)
  const [sshPublicKey, setSshPublicKey] = useState('')
  const [noKey, setNoKey] = useState(false)
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pricing = VPS_TIERS[tier].cycles[cycle]
  const totalCents = pricing.priceCentsCad + (backupAddon ? pricing.backupAddonPriceCentsCad : 0)
  const monthlyEquivalent = totalCents / BILLING_CYCLES[cycle].months

  const canSubmit = legalAccepted && (sshPublicKey.trim().length > 0 || noKey) && !busy

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/vps/configure', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tier,
          billingCycle: cycle,
          backupAddon,
          sshPublicKey: noKey ? undefined : sshPublicKey.trim(),
          wantsPasswordFallback: noKey,
          legalAccepted,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create order')

      const checkoutRes = await fetch('/api/vps/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId: data.orderId }),
      })
      const checkoutData = await checkoutRes.json()
      if (!checkoutRes.ok || !checkoutData.url) throw new Error(checkoutData.error ?? 'Failed to start checkout')
      window.location.href = checkoutData.url
    } catch (err: any) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-semibold mb-3">Choose a size</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {VPS_TIER_KEYS.map((key) => {
            const t = VPS_TIERS[key]
            const active = tier === key
            return (
              <button
                type="button"
                key={key}
                onClick={() => setTier(key)}
                className={`text-left p-4 rounded-xl border ${active ? 'border-[#f59e0b] bg-[#f59e0b]/5' : 'border-zinc-800'}`}
              >
                <div className="font-semibold">{t.label}</div>
                <div className="text-xs text-zinc-400 mt-1">{t.vcpu} vCPU · {t.ramGb}GB RAM · {t.diskGb}GB disk</div>
                <div className="text-sm font-semibold mt-2">{formatCad(t.cycles.monthly.priceCentsCad)}/mo</div>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold mb-3">Billing cycle</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {BILLING_CYCLE_KEYS.map((key) => {
            const c = BILLING_CYCLES[key]
            const active = cycle === key
            const cyclePricing = VPS_TIERS[tier].cycles[key]
            const perMonth = cyclePricing.priceCentsCad / c.months
            const savingsPct = key === 'monthly' ? 0 : Math.round((1 - perMonth / (VPS_TIERS[tier].cycles.monthly.priceCentsCad)) * 100)
            return (
              <button
                type="button"
                key={key}
                onClick={() => setCycle(key)}
                className={`text-left p-3 rounded-xl border ${active ? 'border-[#f59e0b] bg-[#f59e0b]/5' : 'border-zinc-800'}`}
              >
                <div className="text-sm font-semibold">{c.label}</div>
                <div className="text-xs text-zinc-400 mt-1">{formatCad(perMonth)}/mo</div>
                {savingsPct > 0 && <div className="text-xs text-emerald-400">Save {savingsPct}%</div>}
              </button>
            )
          })}
        </div>
      </div>

      <label className="flex items-center gap-3 p-4 rounded-xl border border-zinc-800 cursor-pointer">
        <input type="checkbox" checked={backupAddon} onChange={(e) => setBackupAddon(e.target.checked)} className="w-4 h-4" />
        <div>
          <div className="text-sm font-semibold">Automatic backups</div>
          <div className="text-xs text-zinc-400">+{formatCad(pricing.backupAddonPriceCentsCad)} for this billing cycle</div>
        </div>
      </label>

      <div>
        <label className="block text-sm font-semibold mb-2">Access</label>
        {!noKey && (
          <textarea
            value={sshPublicKey}
            onChange={(e) => setSshPublicKey(e.target.value)}
            placeholder="ssh-ed25519 AAAA... or ssh-rsa AAAA..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-[#0b111c] border border-zinc-700 text-sm font-mono"
          />
        )}
        <label className="flex items-center gap-2 mt-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={noKey}
            onChange={(e) => setNoKey(e.target.checked)}
            className="w-3.5 h-3.5"
          />
          I don't have an SSH key — give me a one-time root password instead
        </label>
      </div>

      <div className="pt-4 border-t border-zinc-800 flex items-center justify-between">
        <div>
          <div className="text-xs text-zinc-400">Total for this cycle</div>
          <div className="text-2xl font-bold">{formatCad(totalCents)}</div>
          <div className="text-xs text-zinc-500">≈ {formatCad(monthlyEquivalent)}/mo</div>
        </div>
      </div>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={legalAccepted}
          onChange={(e) => setLegalAccepted(e.target.checked)}
          className="w-4 h-4 mt-0.5"
        />
        <span className="text-xs text-zinc-400">
          I have read and accept the Bario VPS{' '}
          <a href="/legal/vps-aup" target="_blank" rel="noopener noreferrer" className="text-[#f59e0b] underline">
            Acceptable Use Policy and Service Terms
          </a>{' '}
          (v{CURRENT_VPS_POLICY_VERSION})
        </span>
      </label>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full px-4 py-3 rounded-xl font-semibold bg-[#f59e0b] text-[#1a1200] disabled:opacity-50"
      >
        {busy ? 'Redirecting…' : `Order server — ${formatCad(totalCents)}`}
      </button>
    </form>
  )
}
