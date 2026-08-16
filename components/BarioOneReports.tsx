'use client'

import { useEffect, useState } from 'react'

type Summary = {
  from: string
  to: string
  subtotalCents: number
  discountCents: number
  taxCents: number
  totalCents: number
  cogsCents: number
  grossProfitCents: number
  marginPercent: number
  expensesCents: number
  netProfitCents: number
  invoiceCount: number
  monthly: { month: string; revenueCents: number; cogsCents: number }[]
}

function money(cents: number) {
  return `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10)
}

function rangeForPreset(preset: string): { from: string; to: string } {
  const now = new Date()
  if (preset === 'month') {
    return { from: ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), to: ymd(now) }
  }
  if (preset === 'quarter') {
    const q = Math.floor(now.getUTCMonth() / 3)
    return { from: ymd(new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1))), to: ymd(now) }
  }
  return { from: ymd(new Date(Date.UTC(now.getUTCFullYear(), 0, 1))), to: ymd(now) }
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4">
      <p className="text-xs text-slate-500 dark:text-zinc-400">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function BarioOneReports() {
  const [preset, setPreset] = useState<'ytd' | 'quarter' | 'month' | 'custom'>('ytd')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(f: string, t: string) {
    setLoading(true)
    const res = await fetch(`/api/bario-one/reports/summary?from=${f}&to=${t}`)
    const data = await res.json()
    setSummary(data)
    setFrom(data.from)
    setTo(data.to)
    setLoading(false)
  }

  useEffect(() => {
    if (preset === 'custom') return
    const r = preset === 'ytd' ? rangeForPreset('ytd') : rangeForPreset(preset)
    load(r.from, r.to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {(['month', 'quarter', 'ytd', 'custom'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={`text-sm font-medium px-3 py-1.5 rounded-lg ${preset === p ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-zinc-800'}`}
          >
            {p === 'month' ? 'This month' : p === 'quarter' ? 'This quarter' : p === 'ytd' ? 'YTD' : 'Custom'}
          </button>
        ))}
        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-2 py-1.5 text-sm" />
            <span className="text-sm text-slate-400">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-2 py-1.5 text-sm" />
            <button onClick={() => load(from, to)} className="text-sm font-medium bg-slate-100 dark:bg-zinc-800 px-3 py-1.5 rounded-lg">Apply</button>
          </div>
        )}
      </div>

      {loading || !summary ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Revenue before tax" value={money(summary.subtotalCents)} sub={`${summary.invoiceCount} invoice${summary.invoiceCount === 1 ? '' : 's'}`} />
            <StatCard label="Tax collected" value={money(summary.taxCents)} />
            <StatCard label="Total revenue (after tax)" value={money(summary.totalCents)} />
            <StatCard label="Cost of goods sold" value={money(summary.cogsCents)} />
            <StatCard label="Gross profit" value={money(summary.grossProfitCents)} sub={`${summary.marginPercent.toFixed(1)}% margin`} />
            <StatCard label="Expenses" value={money(summary.expensesCents)} />
            <StatCard label="Net profit" value={money(summary.netProfitCents)} sub="Gross profit minus expenses" />
          </div>

          {summary.monthly.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2">By month</p>
              <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
                {summary.monthly.map((m) => (
                  <div key={m.month} className="flex items-center justify-between p-3 text-sm">
                    <span className="text-slate-500 dark:text-zinc-400">{m.month}</span>
                    <span>Revenue {money(m.revenueCents)}</span>
                    <span className="text-slate-400">COGS {money(m.cogsCents)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
