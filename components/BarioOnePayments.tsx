'use client'

import { useEffect, useState } from 'react'

type Status = { status: string; accountId: string | null; chargesEnabled: boolean; detailsSubmitted: boolean; feePercent: number } | null

export default function BarioOnePayments() {
  const [data, setData] = useState<Status>(undefined as any)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/bario-one/payments/status')
    if (!res.ok) {
      setData(null)
      return
    }
    setData(await res.json())
  }

  useEffect(() => {
    load()
  }, [])

  async function handleConnect() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/bario-one/payments/onboard', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Something went wrong')
      window.location.href = json.url
    } catch (err: any) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (data === undefined) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
  if (!data) return <p className="text-sm text-red-500 dark:text-red-400">Set up Bario One from the dashboard first.</p>

  return (
    <div className="space-y-4 max-w-lg">
      <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-semibold">Online payments</p>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
              data.status === 'active'
                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400'
            }`}
          >
            {data.status === 'active' ? 'Connected' : data.status === 'onboarding' ? 'Setup in progress' : 'Not connected'}
          </span>
        </div>
        <p className="text-sm text-slate-500 dark:text-zinc-400">
          {data.status === 'active'
            ? 'Customers can pay your invoices online — funds go directly to your own bank account via Stripe, not through Bario.'
            : 'Connect a Stripe account so customers can pay your invoices online. This takes a few minutes and requires your business/bank details — Stripe handles that step directly, Bario never sees them.'}
        </p>
        {data.status !== 'active' && (
          <button onClick={handleConnect} disabled={busy} className="rounded-lg bg-[#635bff] hover:opacity-90 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2.5">
            {busy ? 'Redirecting…' : data.status === 'onboarding' ? 'Finish Stripe setup' : 'Connect with Stripe'}
          </button>
        )}
        {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      </div>
      <p className="text-xs text-slate-400">
        Bario platform fee: {data.feePercent}% {data.feePercent === 0 && '(currently free — introductory pricing while this feature is new)'}
      </p>
    </div>
  )
}
