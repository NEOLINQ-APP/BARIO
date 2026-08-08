'use client'

import { useEffect, useState } from 'react'

type OrgInfo = {
  id: string
  name: string
  plan: string
  planName: string
  seatLimit: number | null
  subscriptionStatus: string
  trialEndsAt: string | null
  hasLiveBilling: boolean
} | null

const MODULES = [
  { icon: '🧑‍💼', name: 'CRM', href: '/dashboard/bario-one/crm' },
  { icon: '🧾', name: 'Invoicing', href: '/dashboard/bario-one/crm/invoices' },
  { icon: '💳', name: 'Payments', href: '/dashboard/bario-one/payments' },
  { icon: '👥', name: 'Employees', href: '/dashboard/bario-one/hr' },
  { icon: '🇨🇦', name: 'Payroll', href: '/dashboard/bario-one/payroll' },
  { icon: '🛒', name: 'POS', href: '/dashboard/bario-one/pos' },
  { icon: '📦', name: 'Inventory', href: '/dashboard/bario-one/pos/products' },
  { icon: '🤖', name: 'AI Assistant', href: null },
]

function OnboardingCard() {
  const [companyName, setCompanyName] = useState('')
  const [plan, setPlan] = useState('starter')
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
        body: JSON.stringify({ companyName, plan }),
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
      <p className="text-sm text-zinc-400">This creates your company workspace and starts a 14-day free trial.</p>
      <form onSubmit={handleCreate} className="space-y-3">
        <input
          type="text"
          required
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Company name"
          className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white focus:border-[#d4af37] outline-none"
        />
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white focus:border-[#d4af37] outline-none"
        >
          <option value="starter">Starter — $49/mo</option>
          <option value="professional">Professional — $149/mo</option>
          <option value="business">Business — $299/mo</option>
        </select>
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
  const [checkoutBusy, setCheckoutBusy] = useState(false)

  async function load() {
    const res = await fetch('/api/bario-one/organization')
    const data = await res.json()
    setOrg(data.org)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function startBilling() {
    setCheckoutBusy(true)
    try {
      const res = await fetch('/api/bario-one/checkout', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      window.location.href = data.url
    } catch (err: any) {
      alert(err.message)
      setCheckoutBusy(false)
    }
  }

  if (loading) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
  if (!org) return <OnboardingCard />

  const trialDaysLeft = org.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(org.trialEndsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
    : null

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#d4af37]/30 bg-black text-white p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-[#d4af37] font-semibold">{org.planName} plan</p>
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
        {!org.hasLiveBilling && org.plan !== 'enterprise' && (
          <button
            onClick={startBilling}
            disabled={checkoutBusy}
            className="rounded-lg bg-[#d4af37] hover:bg-[#c49f2f] disabled:opacity-50 text-black font-semibold text-sm px-4 py-2.5"
          >
            {checkoutBusy ? 'Redirecting…' : 'Add payment method'}
          </button>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold">Modules</h3>
          <a href="/dashboard/bario-one/team" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline">
            Manage team →
          </a>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {MODULES.map((m) => {
            const content = (
              <>
                <div className="flex items-start justify-between">
                  <span className="text-2xl">{m.icon}</span>
                  {!m.href && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
                      Coming soon
                    </span>
                  )}
                </div>
                <p className="font-semibold text-sm">{m.name}</p>
              </>
            )
            const className = `rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 flex flex-col gap-2 ${
              m.href ? 'hover:border-amber-500 dark:hover:border-[#d4af37] transition-colors' : 'opacity-60'
            }`
            return m.href ? (
              <a key={m.name} href={m.href} className={className}>{content}</a>
            ) : (
              <div key={m.name} className={className}>{content}</div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
