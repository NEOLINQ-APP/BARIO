'use client'

import { useState } from 'react'
import { VPS_TIERS, VPS_TIER_KEYS, BILLING_CYCLES, BILLING_CYCLE_KEYS, type BillingCycle } from '@/lib/vpsTiers'

function formatCad(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export default function VpsPricingSection() {
  const [cycle, setCycle] = useState<BillingCycle>('monthly')

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-1 mb-10 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full p-1 w-fit mx-auto">
        {BILLING_CYCLE_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => setCycle(key)}
            className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${cycle === key ? 'bg-cyan-500 text-slate-950' : 'text-slate-500 dark:text-slate-400'}`}
          >
            {BILLING_CYCLES[key].label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {VPS_TIER_KEYS.map((key) => {
          const tier = VPS_TIERS[key]
          const pricing = tier.cycles[cycle]
          const perMonth = pricing.priceCentsCad / BILLING_CYCLES[cycle].months
          const savingsPct = cycle === 'monthly' ? 0 : Math.round((1 - perMonth / tier.cycles.monthly.priceCentsCad) * 100)
          const featured = key === 'medium'
          return (
            <div
              key={key}
              className={
                featured
                  ? 'bg-white dark:bg-slate-900 border-2 border-cyan-500 rounded-2xl p-8 flex flex-col justify-between space-y-6 relative shadow-xl dark:shadow-2xl shadow-cyan-500/10'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 flex flex-col justify-between space-y-6'
              }
            >
              {featured && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 bg-cyan-500 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-full">
                  Most popular
                </div>
              )}
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{tier.label}</h3>
                <div>
                  <div className="text-4xl font-extrabold text-slate-900 dark:text-white">
                    {formatCad(perMonth)} <span className="text-sm text-slate-500 dark:text-slate-400 font-normal">/mo CAD</span>
                  </div>
                  {cycle !== 'monthly' && (
                    <div className="text-xs mt-1">
                      <span className="text-slate-500">billed {formatCad(pricing.priceCentsCad)} {BILLING_CYCLES[cycle].label.toLowerCase()}</span>
                      {savingsPct > 0 && <span className="text-emerald-600 dark:text-emerald-400 ml-2">Save {savingsPct}%</span>}
                    </div>
                  )}
                </div>
                <ul className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                  <li className="flex items-center gap-2"><span className="text-cyan-600 dark:text-cyan-400">✓</span> {tier.vcpu} vCPU</li>
                  <li className="flex items-center gap-2"><span className="text-cyan-600 dark:text-cyan-400">✓</span> {tier.ramGb}GB RAM</li>
                  <li className="flex items-center gap-2"><span className="text-cyan-600 dark:text-cyan-400">✓</span> {tier.diskGb}GB SSD disk</li>
                  <li className="flex items-center gap-2"><span className="text-cyan-600 dark:text-cyan-400">✓</span> Full root access, any Linux OS</li>
                  <li className="flex items-center gap-2"><span className="text-cyan-600 dark:text-cyan-400">✓</span> Automatic security patching</li>
                  <li className="flex items-center gap-2 text-slate-500 dark:text-slate-400"><span className="text-slate-400 dark:text-slate-600">+</span> Optional automatic backups, {formatCad(pricing.backupAddonPriceCentsCad)}/{BILLING_CYCLES[cycle].label.toLowerCase()}</li>
                </ul>
              </div>
              <a
                href="/signup"
                className={`w-full text-center px-4 py-2.5 rounded-xl font-semibold transition-colors ${
                  featured ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400' : 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600'
                }`}
              >
                Order {tier.label}
              </a>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-slate-500 mt-6 text-center">
        Prices in CAD. Self-managed — you get full root access, we handle the hardware. Order from your dashboard after signing in.
      </p>
    </>
  )
}
