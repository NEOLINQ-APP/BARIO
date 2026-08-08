'use client'

import { useEffect, useState } from 'react'

type ReportRow = {
  id: string
  frequency: string
  pay_period_start: string
  pay_period_end: string
  pay_date: string
  status: string
  employee_count: number
  total_gross_cents: number
  total_tax_cents: number
  total_cpp_cents: number
  total_ei_cents: number
  total_net_cents: number
}

function money(cents: number) {
  return `$${(Number(cents) / 100).toFixed(2)}`
}

export default function BarioOnePayrollReports() {
  const [rows, setRows] = useState<ReportRow[] | null>(null)

  useEffect(() => {
    fetch('/api/bario-one/payroll/reports')
      .then((r) => r.json())
      .then((data) => setRows(data.report ?? []))
  }, [])

  if (rows === null) return <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>
  if (rows.length === 0) return <p className="text-sm text-slate-500 dark:text-zinc-400">No pay runs yet.</p>

  const grandTotalNet = rows.reduce((sum, r) => sum + Number(r.total_net_cents), 0)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="text-left text-xs text-slate-500 dark:text-zinc-400 border-b border-slate-200 dark:border-zinc-800">
              <th className="p-3 font-normal">Pay period</th>
              <th className="p-3 font-normal text-right">Employees</th>
              <th className="p-3 font-normal text-right">Gross</th>
              <th className="p-3 font-normal text-right">Tax</th>
              <th className="p-3 font-normal text-right">CPP/QPP</th>
              <th className="p-3 font-normal text-right">EI/QPIP</th>
              <th className="p-3 font-normal text-right">Net</th>
              <th className="p-3 font-normal text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 dark:border-zinc-900">
                <td className="p-3">
                  <a href={`/dashboard/bario-one/payroll/${r.id}`} className="text-amber-600 dark:text-[#d4af37] hover:underline">
                    {r.pay_period_start.slice(0, 10)} – {r.pay_period_end.slice(0, 10)}
                  </a>
                </td>
                <td className="p-3 text-right">{r.employee_count}</td>
                <td className="p-3 text-right">{money(r.total_gross_cents)}</td>
                <td className="p-3 text-right">{money(r.total_tax_cents)}</td>
                <td className="p-3 text-right">{money(r.total_cpp_cents)}</td>
                <td className="p-3 text-right">{money(r.total_ei_cents)}</td>
                <td className="p-3 text-right font-semibold">{money(r.total_net_cents)}</td>
                <td className="p-3 text-right capitalize text-xs">{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm font-semibold">Total net pay across all runs: {money(grandTotalNet)}</p>
    </div>
  )
}
