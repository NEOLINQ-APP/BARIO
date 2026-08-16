'use client'

import { useMemo, useState } from 'react'
import { BO_PLANS, PAYROLL_BASE_CENTS_CAD, PAYROLL_PER_EMPLOYEE_CENTS_CAD } from '@/lib/barioOneTiers'

// Illustrative typical small-business software costs — a per-seat CRM
// price (Salesforce/HubSpot-style), flat accounting/POS/AI tool prices, and
// a per-employee payroll price (Gusto-style). These are representative
// averages for the calculator, not scraped real-time competitor pricing —
// labeled as such in the UI rather than presented as a precise quote.
const STACK_CRM_PER_EMPLOYEE_CENTS = 2500
const STACK_ACCOUNTING_FLAT_CENTS = 4000
const STACK_POS_FLAT_CENTS = 6900
const STACK_PAYROLL_BASE_CENTS = 4000
const STACK_PAYROLL_PER_EMPLOYEE_CENTS = 600
const STACK_AI_FLAT_CENTS = 3000

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`
}

function tierForEmployeeCount(n: number): 'starter' | 'professional' | 'business' {
  if (n <= 3) return 'starter'
  if (n <= 15) return 'professional'
  return 'business'
}

export default function BarioOneRoiCalculator() {
  const [employees, setEmployees] = useState(5)

  const { stackTotalCents, barioTotalCents, savingsCents, savingsPercent, planKey } = useMemo(() => {
    const stackTotal =
      STACK_CRM_PER_EMPLOYEE_CENTS * employees +
      STACK_ACCOUNTING_FLAT_CENTS +
      STACK_POS_FLAT_CENTS +
      STACK_PAYROLL_BASE_CENTS +
      STACK_PAYROLL_PER_EMPLOYEE_CENTS * employees +
      STACK_AI_FLAT_CENTS

    const plan = tierForEmployeeCount(employees)
    const tierPrice = BO_PLANS[plan].priceCentsCad ?? 0
    const payrollCost = PAYROLL_BASE_CENTS_CAD + PAYROLL_PER_EMPLOYEE_CENTS_CAD * employees
    const barioTotal = tierPrice + payrollCost

    const savings = stackTotal - barioTotal
    const pct = stackTotal > 0 ? Math.round((savings / stackTotal) * 100) : 0

    return { stackTotalCents: stackTotal, barioTotalCents: barioTotal, savingsCents: savings, savingsPercent: pct, planKey: plan }
  }, [employees])

  return (
    <div className="rounded-3xl border border-[#d4af37]/20 bg-zinc-950 p-8 sm:p-10">
      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-10 items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#d4af37] mb-2">Savings calculator</p>
          <h3 className="text-2xl font-bold mb-3">What are you paying for CRM, accounting, POS, payroll, and AI — separately?</h3>
          <p className="text-sm text-zinc-400 mb-6">
            Most small businesses run 4–5 different subscriptions to cover what Bario One does in one login. Drag the
            slider to your team size and see the typical monthly difference.
          </p>
          <label className="block text-xs font-medium text-zinc-400 mb-2">
            Team size: <span className="text-white font-semibold">{employees} {employees === 1 ? 'employee' : 'employees'}</span>
          </label>
          <input
            type="range"
            min={1}
            max={40}
            value={employees}
            onChange={(e) => setEmployees(Number(e.target.value))}
            className="w-full accent-[#d4af37]"
          />
          <p className="text-[11px] text-zinc-600 mt-3">
            Illustrative typical costs for a small-business CRM, accounting, POS, payroll, and AI tool stack — not a quote from any specific vendor.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-zinc-800 bg-black p-6">
            <p className="text-xs font-medium text-zinc-500 mb-1">Separate tools (typical)</p>
            <p className="text-3xl font-extrabold text-zinc-300">{money(stackTotalCents)}<span className="text-sm font-medium text-zinc-600">/mo</span></p>
            <p className="text-xs text-zinc-600 mt-2">CRM + Accounting + POS + Payroll + AI, as 5 subscriptions</p>
          </div>
          <div className="rounded-2xl border border-[#d4af37]/40 bg-[#d4af37]/5 p-6">
            <p className="text-xs font-medium text-[#d4af37] mb-1">Bario One ({BO_PLANS[planKey].name} + Payroll)</p>
            <p className="text-3xl font-extrabold text-white">{money(barioTotalCents)}<span className="text-sm font-medium text-zinc-500">/mo</span></p>
            <p className="text-xs text-zinc-500 mt-2">One login, monthly billing shown — annual saves another 20%</p>
          </div>
          <div className="sm:col-span-2 rounded-2xl bg-gradient-to-r from-[#d4af37]/20 to-transparent border border-[#d4af37]/30 p-6 text-center">
            <p className="text-sm text-zinc-300">Estimated savings</p>
            <p className="text-4xl font-extrabold text-[#d4af37]">
              {savingsCents >= 0 ? money(savingsCents) : `-${money(Math.abs(savingsCents))}`}
              <span className="text-base font-semibold text-zinc-400">/mo{savingsPercent !== 0 ? ` (${savingsPercent}%)` : ''}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
