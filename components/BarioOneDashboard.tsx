'use client'

import { useEffect, useState } from 'react'
import type { BoModuleKey } from '@/lib/barioOneModules'
import BarioOneModuleCheckboxes from './BarioOneModuleCheckboxes'

type OrgInfo = {
  id: string
  name: string
  plan: string
  planName: string
  enabledModules: string[]
  seatLimit: number | null
  subscriptionStatus: string
  trialEndsAt: string | null
  hasLiveBilling: boolean
} | null

function OnboardingCard() {
  const [companyName, setCompanyName] = useState('')
  const [moduleKeys, setModuleKeys] = useState<BoModuleKey[]>(['crm'])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/bario-one/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyName, moduleKeys }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      window.location.reload()
    } catch (err: any) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="max-w-md rounded-2xl border border-[#d4af37]/30 bg-black text-white p-6 space-y-4">
      <h2 className="text-lg font-bold">Set up Bario One for your business</h2>
      <p className="text-sm text-zinc-400">This creates your company workspace and starts a 14-day free trial on whatever modules you pick.</p>
      <form onSubmit={handleCreate} className="space-y-3">
        <input
          type="text"
          required
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Company name"
          className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white focus:border-[#d4af37] outline-none"
        />
        <BarioOneModuleCheckboxes selected={moduleKeys} onChange={setModuleKeys} dark />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-[#d4af37] hover:bg-[#c49f2f] disabled:opacity-50 text-black font-semibold text-sm px-4 py-2.5"
        >
          {busy ? 'Creating…' : 'Create workspace'}
        </button>
      </form>
    </div>
  )
}

export default function BarioOneDashboard() {
  const [org, setOrg] = useState<OrgInfo>(undefined as any)
  const [loading, setLoading] = useState(true)

  async function load() {
    const res = await fetch('/api/bario-one/organization')
    const data = await res.json()
    setOrg(data.org)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
  if (!org) return <OnboardingCard />

  const trialDaysLeft = org.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(org.trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null
  const moduleCount = org.enabledModules.length

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#d4af37]/30 bg-black text-white p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-[#d4af37] font-semibold">
            {moduleCount} module{moduleCount === 1 ? '' : 's'} enabled
          </p>
          <h2 className="text-2xl font-extrabold">{org.name}</h2>
          <p className="text-sm text-zinc-400 mt-1">
            {org.subscriptionStatus === 'trialing' && !org.hasLiveBilling && trialDaysLeft !== null
              ? `Free trial — ${trialDaysLeft} day${trialDaysLeft === 1 ? '' : 's'} left, no card on file`
              : org.subscriptionStatus === 'active'
              ? 'Billing active'
              : org.subscriptionStatus === 'past_due'
              ? 'Payment past due — please update your billing'
              : org.subscriptionStatus === 'canceled'
              ? 'Subscription canceled'
              : org.subscriptionStatus}
          </p>
        </div>
        {!org.hasLiveBilling && (
          <a
            href="/dashboard/bario-one/modules"
            className="rounded-lg bg-[#d4af37] hover:bg-[#c49f2f] text-black font-semibold text-sm px-4 py-2.5"
          >
            Activate billing
          </a>
        )}
      </div>

      <div className="flex gap-4">
        <a href="/dashboard/bario-one/company" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline">
          Company settings →
        </a>
        <a href="/dashboard/bario-one/modules" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline">
          Manage modules →
        </a>
        <a href="/dashboard/bario-one/team" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline">
          Manage team →
        </a>
      </div>
    </div>
  )
}
