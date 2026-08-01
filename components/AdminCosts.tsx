'use client'

import { useEffect, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'

type CycleMargin = { cycle: string; label: string; priceCentsCad: number; rawCostCentsCad: number; marginCents: number; marginPercent: number }
type TierMargin = { key: string; label: string; hetznerServerType: string; hetznerRawCostCentsEur: number; hetznerCostCentsCadPerMonth: number; cycles: CycleMargin[] }

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

export default function AdminCosts() {
  const [tiers, setTiers] = useState<TierMargin[] | null>(null)
  const [eurToCad, setEurToCad] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/costs')
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error)
        setTiers(data.tiers)
        setEurToCad(data.eurToCad)
      })
      .catch((err) => setError(err.message))
  }, [])

  if (error) return <p className="text-sm text-red-500 dark:text-red-400 p-6">{error}</p>
  if (!tiers) return <p className="text-sm text-slate-500 dark:text-zinc-400 p-6">Loading…</p>

  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Reseller Costs & Margin</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">
              What Bario actually pays Hetzner for VPS vs. what's charged — use this to know how much discount room
              exists before offering a coupon. Rate: 1 EUR = {eurToCad?.toFixed(4)} CAD (live, updates each visit).
            </p>
          </div>
          <ThemeToggle />
        </div>

        {tiers.map((tier) => (
          <div key={tier.key} className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#131b2a] p-5">
            <div className="flex items-baseline justify-between mb-3">
              <p className="font-semibold">
                {tier.label} <span className="text-xs text-slate-500 dark:text-zinc-500 font-normal">({tier.hetznerServerType})</span>
              </p>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Hetzner cost: €{(tier.hetznerRawCostCentsEur / 100).toFixed(2)}/mo ≈ {money(tier.hetznerCostCentsCadPerMonth)} CAD/mo
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 dark:text-zinc-500">
                    <th className="pb-2 font-normal">Billing</th>
                    <th className="pb-2 font-normal">Charged</th>
                    <th className="pb-2 font-normal">Real cost</th>
                    <th className="pb-2 font-normal">Margin</th>
                    <th className="pb-2 font-normal">Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {tier.cycles.map((c) => (
                    <tr key={c.cycle} className="border-t border-slate-200 dark:border-zinc-800">
                      <td className="py-2">{c.label}</td>
                      <td className="py-2">{money(c.priceCentsCad)}</td>
                      <td className="py-2 text-slate-500 dark:text-zinc-400">{money(c.rawCostCentsCad)}</td>
                      <td className={`py-2 font-medium ${c.marginCents < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{money(c.marginCents)}</td>
                      <td className={`py-2 font-medium ${c.marginPercent < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{c.marginPercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        <p className="text-xs text-slate-500 dark:text-zinc-500">
          Mail hosting (cPanel/WHM reseller) isn't priced/sellable yet — nothing to show margin on there until that's
          built out.
        </p>
      </div>
    </main>
  )
}
