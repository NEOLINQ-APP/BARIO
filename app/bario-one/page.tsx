// app/bario-one/page.tsx
// Public marketing/landing page for Bario One — the AI-powered business
// operating system. Phase 1 (this build) ships the foundation: signup,
// multi-tenant Organizations, trial billing, and the dashboard shell.
// Modules 1-8 (CRM/Invoicing/Payments/Employees/Payroll/POS/Inventory/AI
// Assistant) are the approved build order for later phases — shown here
// honestly as "Coming soon", not implied as already working.

import SiteNav from '@/components/SiteNav'
import SiteFooter from '@/components/SiteFooter'
import BarioOneSignupForm from '@/components/BarioOneSignupForm'
import { BO_PLANS } from '@/lib/barioOneTiers'

export const metadata = {
  title: 'Bario One™ — The AI-powered operating system for your business',
  description: 'CRM, invoicing, payments, employees, payroll, POS, inventory, and an AI assistant — one subscription, one login, built for Canadian businesses.',
  openGraph: {
    title: 'Bario One™ — The AI-powered operating system for your business',
    description: 'Everything your business needs to operate, automate, and grow — powered by AI.',
    url: 'https://bario.ca/bario-one',
    siteName: 'Bario',
    type: 'website',
  },
}

const MODULES = [
  { icon: '🧑‍💼', name: 'Bario CRM', desc: 'Customers, sales pipeline, tasks, and reminders.', status: 'soon' as const },
  { icon: '🧾', name: 'Bario Invoice', desc: 'Estimates, quotes, recurring invoices, PDF generation.', status: 'soon' as const },
  { icon: '💳', name: 'Bario Payments', desc: 'Stripe-powered online payments, deposits, refunds.', status: 'soon' as const },
  { icon: '👥', name: 'Employee Management', desc: 'Profiles, time tracking, clock in/out, scheduling.', status: 'soon' as const },
  { icon: '🇨🇦', name: 'Bario Payroll', desc: 'Canadian payroll — AB, BC, ON, SK, MB, QC.', status: 'soon' as const },
  { icon: '🛒', name: 'Bario POS', desc: 'Point of sale, barcode support, receipts, loyalty.', status: 'soon' as const },
  { icon: '📦', name: 'Bario Inventory', desc: 'Stock levels, suppliers, purchase orders, alerts.', status: 'soon' as const },
  { icon: '🤖', name: 'Bario AI Assistant', desc: 'Ask it who owes money, create an invoice, schedule staff.', status: 'soon' as const },
]

function PlanCard({ planKey }: { planKey: keyof typeof BO_PLANS }) {
  const plan = BO_PLANS[planKey]
  const isEnterprise = planKey === 'enterprise'
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 flex flex-col gap-4 hover:border-[#d4af37]/50 transition-colors">
      <div>
        <p className="text-sm font-semibold text-[#d4af37] uppercase tracking-wide">{plan.name}</p>
        <p className="text-3xl font-extrabold text-white mt-1">
          {plan.priceCentsCad === null ? 'Custom' : `$${(plan.priceCentsCad / 100).toFixed(0)}`}
          {plan.priceCentsCad !== null && <span className="text-sm font-medium text-zinc-500">/mo CAD</span>}
        </p>
      </div>
      <ul className="space-y-1.5 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="text-sm text-zinc-300 flex items-center gap-2">
            <span className="text-[#d4af37]">✓</span> {f}
          </li>
        ))}
      </ul>
      <a
        href={isEnterprise ? 'mailto:sales@bario.ca?subject=Bario%20One%20Enterprise' : '#signup'}
        className="text-center rounded-lg border border-[#d4af37] text-[#d4af37] hover:bg-[#d4af37] hover:text-black font-semibold text-sm px-4 py-2.5 transition-colors"
      >
        {isEnterprise ? 'Contact sales' : 'Start free trial'}
      </a>
    </div>
  )
}

export default function BarioOnePage() {
  return (
    <main className="min-h-screen bg-black text-white font-sans antialiased">
      <SiteNav active="bario-one" />

      {/* HERO */}
      <section className="relative overflow-hidden py-24 px-6 sm:px-12 border-b border-zinc-800">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-[#d4af37]/10 blur-[130px] rounded-full pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center space-y-6 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#d4af37]/10 border border-[#d4af37]/30 text-[#d4af37] text-sm font-medium">
            Bario One™
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight">
            The AI-powered operating system<br className="hidden sm:block" /> for your business.
          </h1>
          <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
            Everything your business needs to operate, automate, and grow — CRM, invoicing, payments, employees,
            payroll, POS, inventory, and an AI assistant, in one subscription.
          </p>
          <div className="flex items-center justify-center gap-4 pt-2">
            <a href="#signup" className="rounded-lg bg-[#d4af37] hover:bg-[#c49f2f] text-black font-semibold px-6 py-3 transition-colors">
              Start free trial
            </a>
            <a href="#pricing" className="rounded-lg border border-zinc-700 hover:border-zinc-500 px-6 py-3 transition-colors">
              See pricing
            </a>
          </div>
        </div>
      </section>

      {/* MODULES */}
      <section className="py-20 px-6 sm:px-12 border-b border-zinc-800">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2">Everything, under one roof</h2>
          <p className="text-zinc-400 text-center mb-12">Replace your CRM, invoicing, payroll, and POS subscriptions with one.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {MODULES.map((m) => (
              <div key={m.name} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 flex flex-col gap-2">
                <div className="flex items-start justify-between">
                  <span className="text-2xl">{m.icon}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                    Coming soon
                  </span>
                </div>
                <p className="font-semibold text-sm">{m.name}</p>
                <p className="text-xs text-zinc-500">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-20 px-6 sm:px-12 border-b border-zinc-800">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12">Simple, transparent pricing</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <PlanCard planKey="starter" />
            <PlanCard planKey="professional" />
            <PlanCard planKey="business" />
            <PlanCard planKey="enterprise" />
          </div>
        </div>
      </section>

      {/* SIGNUP */}
      <section className="py-20 px-6 sm:px-12">
        <BarioOneSignupForm />
      </section>

      <div className="bg-white dark:bg-slate-950">
        <SiteFooter />
      </div>
    </main>
  )
}
