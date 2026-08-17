'use client'

import { useEffect, useState } from 'react'

type Summary = {
  from: string
  to: string
  stageBuckets: { stage: string; count: number; value_cents: number }[]
  wonCount: number
  lostCount: number
  winRate: number
  avgDealSizeCents: number
  avgDaysToClose: number
  newCustomersCount: number
  taskCompletionRate: number
  taskCount: number
  byRep: { userId: string; email: string | null; wonCount: number; wonValueCents: number }[]
}

function money(cents: number) {
  return `$${(cents / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10)
}

function rangeForPreset(preset: string): { from: string; to: string } {
  const now = new Date()
  if (preset === 'quarter') {
    const q = Math.floor(now.getUTCMonth() / 3)
    return { from: ymd(new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1))), to: ymd(now) }
  }
  if (preset === 'ytd') {
    return { from: ymd(new Date(Date.UTC(now.getUTCFullYear(), 0, 1))), to: ymd(now) }
  }
  return { from: ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))), to: ymd(now) }
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

export default function BarioOneCrmReports() {
  const [preset, setPreset] = useState<'month' | 'quarter' | 'ytd' | 'custom'>('month')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  async function load(f: string, t: string) {
    setLoading(true)
    const res = await fetch(`/api/bario-one/crm/reports/summary?from=${f}&to=${t}`)
    const data = await res.json()
    setSummary(data)
    setFrom(data.from)
    setTo(data.to)
    setLoading(false)
  }

  useEffect(() => {
    if (preset === 'custom') return
    const r = rangeForPreset(preset)
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
            <StatCard label="Win rate" value={`${summary.winRate.toFixed(0)}%`} sub={`${summary.wonCount} won / ${summary.lostCount} lost`} />
            <StatCard label="Average deal size" value={money(summary.avgDealSizeCents)} sub="Won deals only" />
            <StatCard label="Average time to close" value={`${summary.avgDaysToClose} day${summary.avgDaysToClose === 1 ? '' : 's'}`} />
            <StatCard label="New customers" value={String(summary.newCustomersCount)} />
            <StatCard
              label="Task completion"
              value={`${summary.taskCompletionRate.toFixed(0)}%`}
              sub={`${summary.taskCount} task${summary.taskCount === 1 ? '' : 's'} due in range`}
            />
          </div>

          <div>
            <p className="text-sm font-semibold mb-2">Pipeline funnel</p>
            <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
              {summary.stageBuckets.length === 0 && <p className="p-3 text-xs text-slate-400">No deals yet.</p>}
              {summary.stageBuckets.map((b) => (
                <div key={b.stage} className="flex items-center justify-between p-3 text-sm">
                  <span className="capitalize text-slate-500 dark:text-zinc-400">{b.stage}</span>
                  <span>{b.count} deal{b.count === 1 ? '' : 's'}</span>
                  <span className="text-slate-400">{money(b.value_cents)}</span>
                </div>
              ))}
            </div>
          </div>

          {summary.byRep.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2">By rep (won this range)</p>
              <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
                {summary.byRep.map((r) => (
                  <div key={r.userId} className="flex items-center justify-between p-3 text-sm">
                    <span className="text-slate-500 dark:text-zinc-400">{r.email ?? r.userId}</span>
                    <span>{r.wonCount} deal{r.wonCount === 1 ? '' : 's'}</span>
                    <span className="text-slate-400">{money(r.wonValueCents)}</span>
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
