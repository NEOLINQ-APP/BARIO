'use client'

import { useState } from 'react'
import PricingButton from '@/components/PricingButton'

type Plan = {
  key: string
  name: string
  monthlyCad: number
  annualCad: number
  features: string[]
  featured?: boolean
}

const PLANS: Plan[] = [
  { key: 'starter', name: 'Starter', monthlyCad: 19, annualCad: 190, features: ['1 site', 'Free bario.ca subdomain', '75 AI credits/mo', 'Auto SSL & Managed DNS', 'Remove the Bario badge'] },
  { key: 'business', name: 'Business', monthlyCad: 49, annualCad: 490, featured: true, features: ['5 sites', 'Custom domain + subdomain', '200 AI credits/mo', 'Auto SSL & Managed DNS', 'Remove the Bario badge'] },
  { key: 'agency', name: 'Agency', monthlyCad: 149, annualCad: 1490, features: ['Up to 25 sites', 'Custom domain + subdomain', '750 AI credits/mo', 'White-label HTML export', 'Remove the Bario badge'] },
]

export default function PricingSection() {
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly')

  return (
    <>
      <div className="flex items-center justify-center gap-1 mb-10 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full p-1 w-fit mx-auto">
        <button
          onClick={() => setCycle('monthly')}
          className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${cycle === 'monthly' ? 'bg-cyan-500 text-slate-950' : 'text-slate-500 dark:text-slate-400'}`}
        >
          Monthly
        </button>
        <button
          onClick={() => setCycle('annual')}
          className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${cycle === 'annual' ? 'bg-cyan-500 text-slate-950' : 'text-slate-500 dark:text-slate-400'}`}
        >
          Yearly <span className="opacity-80">— save ~17%</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Free</h3>
            <div className="text-4xl font-extrabold text-slate-900 dark:text-white">$0 <span className="text-sm text-slate-500 dark:text-slate-400 font-normal">/mo</span></div>
            <ul className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
              <li className="flex items-center gap-2"><span className="text-cyan-600 dark:text-cyan-400">✓</span> 1 site</li>
              <li className="flex items-center gap-2"><span className="text-cyan-600 dark:text-cyan-400">✓</span> Free bario.ca subdomain</li>
              <li className="flex items-center gap-2"><span className="text-cyan-600 dark:text-cyan-400">✓</span> 15 AI credits/mo</li>
              <li className="flex items-center gap-2"><span className="text-cyan-600 dark:text-cyan-400">✓</span> Auto SSL</li>
              <li className="flex items-center gap-2 text-slate-500"><span className="text-slate-400 dark:text-slate-600">•</span> "Made with Bario" badge shown</li>
            </ul>
          </div>
          <a href="/signup" className="w-full text-center px-4 py-2 rounded-xl font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200">Start free</a>
        </div>

        {PLANS.map((plan) => {
          const effectiveMonthly = cycle === 'annual' ? plan.annualCad / 12 : plan.monthlyCad
          return (
            <div
              key={plan.key}
              className={
                plan.featured
                  ? 'bg-white dark:bg-slate-900 border-2 border-cyan-500 rounded-2xl p-8 flex flex-col justify-between space-y-6 relative shadow-xl dark:shadow-2xl shadow-cyan-500/10'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 flex flex-col justify-between space-y-6'
              }
            >
              {plan.featured && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 bg-cyan-500 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-full">
                  Most popular
                </div>
              )}
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                <div>
                  <div className="text-4xl font-extrabold text-slate-900 dark:text-white">
                    ${effectiveMonthly.toFixed(cycle === 'annual' ? 2 : 0)} <span className="text-sm text-slate-500 dark:text-slate-400 font-normal">/mo CAD</span>
                  </div>
                  {cycle === 'annual' && (
                    <div className="text-xs text-slate-500 mt-1">billed ${plan.annualCad}/yr</div>
                  )}
                </div>
                <ul className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2"><span className="text-cyan-600 dark:text-cyan-400">✓</span> {f}</li>
                  ))}
                </ul>
              </div>
              <PricingButton plan={plan.key} label={`Choose ${plan.name}`} billingCycle={cycle} />
            </div>
          )
        })}
      </div>
      <p className="text-xs text-slate-500 mt-6 text-center">Prices in CAD. GST/HST extra where applicable. Cancel anytime. 1 AI credit = 1 chat message to Zeus — manual text edits are always free. Free and Starter sites show a small "Made with Bario" badge — any paid plan can remove it.</p>
    </>
  )
}
