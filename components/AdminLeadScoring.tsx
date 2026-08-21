'use client'

import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'

type Weights = {
  fit: { locationMatch: number; serviceMatch: number; customerTypeMatch: number; businessIcpMatch: number; providerCapacity: number }
  need: { strongNeed: number; problemIdentified: number; goalIdentified: number }
  intent: { quoteRequested: number; appointmentRequested: number; readyToPurchase: number; emergencyUrgency: number }
  timing: { today: number; thisWeek: number; thisMonth: number; oneToThreeMonths: number; future: number }
  dataQuality: { validPhone: number; validEmail: number; location: number; need: number; source: number }
}

const GROUP_LABELS: Record<keyof Weights, string> = {
  fit: 'Fit',
  need: 'Need',
  intent: 'Intent',
  timing: 'Timing',
  dataQuality: 'Data quality',
}

const FIELD_LABELS: Record<string, string> = {
  locationMatch: 'Location match',
  serviceMatch: 'Service match',
  customerTypeMatch: 'Customer type match',
  businessIcpMatch: 'Fits ideal customer profile',
  providerCapacity: 'We have capacity',
  strongNeed: 'Strong need expressed',
  problemIdentified: 'Problem identified',
  goalIdentified: 'Goal identified',
  quoteRequested: 'Quote requested',
  appointmentRequested: 'Appointment requested',
  readyToPurchase: 'Ready to purchase',
  emergencyUrgency: 'Emergency / urgent',
  today: 'Wants it today',
  thisWeek: 'This week',
  thisMonth: 'This month',
  oneToThreeMonths: '1–3 months',
  future: 'Someday / future',
  validPhone: 'Valid phone on file',
  validEmail: 'Valid email on file',
  location: 'Address on file',
  need: 'Need recorded (tagged)',
  source: 'Source recorded',
}

function groupTotal(group: Record<string, number>): number {
  return Object.values(group).reduce((a, b) => a + (Number(b) || 0), 0)
}

export default function AdminLeadScoring() {
  const [weights, setWeights] = useState<Weights | null>(null)
  const [defaults, setDefaults] = useState<Weights | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  function load() {
    fetch('/api/admin/lead-scoring/weights')
      .then((r) => r.json())
      .then((d) => {
        setWeights(d.weights)
        setDefaults(d.defaults)
      })
  }

  useEffect(load, [])

  if (!weights) return <p className="p-6 text-sm text-slate-500 dark:text-zinc-400">Loading…</p>

  const total = (Object.keys(weights) as (keyof Weights)[]).reduce((sum, g) => sum + groupTotal(weights[g]), 0)

  async function save() {
    if (!weights) return
    setBusy(true)
    setSaved(false)
    try {
      const res = await fetch('/api/admin/lead-scoring/weights', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(weights),
      })
      if (res.ok) setSaved(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Lead Scoring Weights</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
              How many of the 100 points each signal is worth. Current total: <span className={total === 100 ? 'text-emerald-500' : 'text-amber-500'}>{total}/100</span>
              {total !== 100 && ' — doesn’t need to be exactly 100, scores are clamped, but 100 keeps the math intuitive.'}
            </p>
          </div>
          <ThemeToggle />
        </div>

        <div className="mt-8 space-y-6">
          {(Object.keys(weights) as (keyof Weights)[]).map((groupKey) => (
            <div key={groupKey} className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">{GROUP_LABELS[groupKey]}</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 tabular-nums">{groupTotal(weights[groupKey])} pts</p>
              </div>
              <div className="mt-2 space-y-2">
                {Object.keys(weights[groupKey]).map((fieldKey) => (
                  <div key={fieldKey} className="flex items-center justify-between gap-3">
                    <label className="text-sm text-slate-600 dark:text-zinc-300">{FIELD_LABELS[fieldKey] ?? fieldKey}</label>
                    <input
                      type="number"
                      min={0}
                      value={(weights[groupKey] as any)[fieldKey]}
                      onChange={(e) =>
                        setWeights((prev) =>
                          prev ? { ...prev, [groupKey]: { ...prev[groupKey], [fieldKey]: Math.max(0, Number(e.target.value) || 0) } } : prev
                        )
                      }
                      className="w-20 px-2 py-1 rounded-lg bg-white dark:bg-[#0b111c] border border-slate-300 dark:border-zinc-700 text-sm text-right tabular-nums"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button onClick={save} disabled={busy} className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-semibold disabled:opacity-50">
            {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save weights'}
          </button>
          {defaults && (
            <button onClick={() => setWeights(defaults)} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-zinc-700 text-sm">
              Reset to defaults
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400 dark:text-zinc-500 mt-3">
          Changes apply the next time a lead's score is recalculated (on create, edit, or deal stage change) — not retroactively to existing scores.
        </p>
      </div>
    </main>
  )
}
