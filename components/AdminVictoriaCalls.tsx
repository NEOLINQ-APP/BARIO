'use client'

import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'

type Call = {
  id: string
  call_sid: string
  business_key: 'unique' | 'afc' | 'sunbuilt'
  direction: string
  from_number: string
  to_number: string
  duration_seconds: number
  claude_cost_cents: number
  twilio_cost_cents: number
  total_cost_cents: number
  started_at: string
}
type Summary = Record<string, { calls: number; minutes: number; costCents: number }>

const BUSINESS_LABEL: Record<string, string> = { unique: 'Unique Group Inc.', afc: 'AFC Logistics', sunbuilt: 'Sunbuilt Group' }

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}
function duration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function AdminVictoriaCalls() {
  const [calls, setCalls] = useState<Call[] | null>(null)
  const [summary, setSummary] = useState<Summary>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/victoria/calls')
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error)
        setCalls(data.calls)
        setSummary(data.summary)
      })
      .catch((err) => setError(err.message))
  }, [])

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Victoria — Call Log & Cost</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Real per-call cost: actual Claude token usage + Twilio's published per-minute rates applied to the real call duration.</p>
            <a href="/admin/agents" className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline">← Agents</a>
          </div>
          <ThemeToggle />
        </div>

        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
        {!calls && !error && <p className="text-sm text-slate-500 dark:text-zinc-400">Loading…</p>}

        <div className="grid sm:grid-cols-3 gap-4">
          {['unique', 'afc', 'sunbuilt'].map((key) => {
            const s = summary[key] ?? { calls: 0, minutes: 0, costCents: 0 }
            return (
              <div key={key} className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-5">
                <p className="text-xs text-slate-500 dark:text-zinc-400">{BUSINESS_LABEL[key]}</p>
                <p className="text-lg font-bold mt-1">{money(s.costCents)}</p>
                <p className="text-xs text-slate-500 dark:text-zinc-500 mt-0.5">{s.calls} call{s.calls === 1 ? '' : 's'} · {s.minutes.toFixed(1)} min</p>
              </div>
            )
          })}
        </div>

        {calls && calls.length > 0 && (
          <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 dark:text-zinc-500">
                  <th className="pb-2 font-normal">Date</th>
                  <th className="pb-2 font-normal">Business</th>
                  <th className="pb-2 font-normal">Direction</th>
                  <th className="pb-2 font-normal">Duration</th>
                  <th className="pb-2 font-normal text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} className="border-t border-slate-200 dark:border-zinc-800">
                    <td className="py-2 whitespace-nowrap">{new Date(c.started_at).toLocaleString()}</td>
                    <td className="py-2">{BUSINESS_LABEL[c.business_key]}</td>
                    <td className="py-2 text-xs text-slate-500 dark:text-zinc-500">{c.direction === 'inbound' ? 'Inbound' : 'Outbound'}</td>
                    <td className="py-2">{duration(c.duration_seconds)}</td>
                    <td className="py-2 text-right font-medium">{money(c.total_cost_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {calls && calls.length === 0 && <p className="text-sm text-slate-500 dark:text-zinc-400">No calls logged yet.</p>}
      </div>
    </main>
  )
}
