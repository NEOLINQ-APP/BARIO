'use client'

import { useEffect, useState } from 'react'

type PayRun = { id: string; frequency: string; pay_period_start: string; pay_period_end: string; pay_date: string; status: string }

function RunPayrollForm({ onRun }: { onRun: (id: string, skipped: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly' | 'semimonthly' | 'monthly'>('biweekly')
  const [payPeriodStart, setPayPeriodStart] = useState('')
  const [payPeriodEnd, setPayPeriodEnd] = useState('')
  const [payDate, setPayDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/bario-one/payroll/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ frequency, payPeriodStart, payPeriodEnd, payDate }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong')
      setOpen(false)
      onRun(data.id, data.skipped ?? [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium px-4 py-2">
        + Run payroll
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-4 space-y-3 mb-4 max-w-lg">
      <select value={frequency} onChange={(e) => setFrequency(e.target.value as any)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm">
        <option value="weekly">Weekly</option>
        <option value="biweekly">Biweekly</option>
        <option value="semimonthly">Semi-monthly</option>
        <option value="monthly">Monthly</option>
      </select>
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-slate-500 dark:text-zinc-400 block mb-1">Period start</label>
          <input required type="date" value={payPeriodStart} onChange={(e) => setPayPeriodStart(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500 dark:text-zinc-400 block mb-1">Period end</label>
          <input required type="date" value={payPeriodEnd} onChange={(e) => setPayPeriodEnd(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-500 dark:text-zinc-400 block mb-1">Pay date</label>
          <input required type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="w-full rounded-lg border border-slate-300 dark:border-zinc-700 bg-white dark:bg-[#0b111c] px-3 py-2 text-sm" />
        </div>
      </div>
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
          {busy ? 'Calculating…' : 'Run payroll'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-100 dark:bg-zinc-800 text-sm px-4 py-2">Cancel</button>
      </div>
    </form>
  )
}

export default function BarioOnePayrollList() {
  const [payRuns, setPayRuns] = useState<PayRun[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/bario-one/payroll/runs')
    const data = await res.json()
    setPayRuns(data.payRuns ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  function handleRun(id: string, skipped: string[]) {
    setNotice(skipped.length > 0 ? `Skipped (no province set): ${skipped.join(', ')}` : null)
    load()
    window.location.href = `/dashboard/bario-one/payroll/${id}`
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RunPayrollForm onRun={handleRun} />
        <a href="/dashboard/bario-one/payroll/reports" className="text-sm font-medium text-amber-600 dark:text-[#d4af37] hover:underline">
          Reports →
        </a>
      </div>
      {notice && <p className="text-xs text-amber-600 dark:text-amber-400">{notice}</p>}

      {payRuns === null ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
      ) : payRuns.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-zinc-400">No pay runs yet.</p>
      ) : (
        <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] divide-y divide-slate-200 dark:divide-zinc-800">
          {payRuns.map((r) => (
            <a key={r.id} href={`/dashboard/bario-one/payroll/${r.id}`} className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-zinc-900">
              <div>
                <p className="font-semibold text-sm capitalize">{r.frequency} — {r.pay_period_start.slice(0, 10)} to {r.pay_period_end.slice(0, 10)}</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400">Pay date: {r.pay_date.slice(0, 10)}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${r.status === 'finalized' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400'}`}>
                {r.status}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
