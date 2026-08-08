'use client'

import { useEffect, useState } from 'react'

type Stub = {
  id: string
  employee_id: string
  employee_name: string
  provinceName: string
  regular_hours: number
  overtime_hours: number
  gross_cents: number
  federal_tax_cents: number
  provincial_tax_cents: number
  cpp_or_qpp_cents: number
  ei_cents: number
  qpip_cents: number
  net_pay_cents: number
}
type Data = {
  payRun: { id: string; frequency: string; pay_period_start: string; pay_period_end: string; pay_date: string; status: string }
  stubs: Stub[]
} | null

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export default function BarioOnePayrollRunDetail({ payRunId }: { payRunId: string }) {
  const [data, setData] = useState<Data>(undefined as any)
  const [busy, setBusy] = useState(false)

  async function load() {
    const res = await fetch(`/api/bario-one/payroll/runs/${payRunId}`)
    if (!res.ok) {
      setData(null)
      return
    }
    setData(await res.json())
  }

  useEffect(() => {
    load()
  }, [payRunId])

  async function finalize() {
    setBusy(true)
    try {
      await fetch(`/api/bario-one/payroll/runs/${payRunId}/finalize`, { method: 'POST' })
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (data === undefined) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
  if (!data) return <p className="text-sm text-red-500 dark:text-red-400">Not found.</p>

  const { payRun, stubs } = data
  const totalNet = stubs.reduce((sum, s) => sum + s.net_pay_cents, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold capitalize">{payRun.frequency} pay run</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            {payRun.pay_period_start.slice(0, 10)} to {payRun.pay_period_end.slice(0, 10)} — paid {payRun.pay_date.slice(0, 10)}
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${payRun.status === 'finalized' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400'}`}>
          {payRun.status}
        </span>
      </div>

      <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="text-left text-xs text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800">
              <th className="p-3 font-normal">Employee</th>
              <th className="p-3 font-normal text-right">Gross</th>
              <th className="p-3 font-normal text-right">Tax</th>
              <th className="p-3 font-normal text-right">CPP/QPP</th>
              <th className="p-3 font-normal text-right">EI/QPIP</th>
              <th className="p-3 font-normal text-right">Net pay</th>
              <th className="p-3 font-normal text-right">Stub</th>
            </tr>
          </thead>
          <tbody>
            {stubs.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 dark:border-zinc-900">
                <td className="p-3">{s.employee_name} <span className="text-xs text-slate-400">({s.provinceName})</span></td>
                <td className="p-3 text-right">{money(s.gross_cents)}</td>
                <td className="p-3 text-right">{money(s.federal_tax_cents + s.provincial_tax_cents)}</td>
                <td className="p-3 text-right">{money(s.cpp_or_qpp_cents)}</td>
                <td className="p-3 text-right">{money(s.ei_cents + s.qpip_cents)}</td>
                <td className="p-3 text-right font-semibold">{money(s.net_pay_cents)}</td>
                <td className="p-3 text-right">
                  <a href={`/api/bario-one/payroll/stubs/${s.id}/pdf`} target="_blank" rel="noreferrer" className="text-amber-600 dark:text-[#d4af37] hover:underline text-xs">PDF</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Total net pay: {money(totalNet)}</p>
        {payRun.status === 'draft' && (
          <button onClick={finalize} disabled={busy} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2">
            {busy ? 'Finalizing…' : 'Finalize pay run'}
          </button>
        )}
      </div>
    </div>
  )
}
