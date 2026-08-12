// app/bario-one/page.tsx
// Public marketing/landing page for Bario One — the AI-powered business
// operating system. Sold modularly (2026-08-11 repackaging): a business
// picks exactly which modules it wants and pays only for those, instead of
// one of 3 fixed bundles — the real interactive picker lives in the signup
// form below; this page's own pricing section is an informational price
// list per module.

import SiteNav from '@/components/SiteNav'
import SiteFooter from '@/components/SiteFooter'
import BarioOneSignupForm from '@/components/BarioOneSignupForm'
import { BO_MODULE_KEYS, BO_MODULES, type BoModuleKey } from '@/lib/barioOneModules'

export const metadata = {
  title: 'Bario One™ — The AI-powered operating system for your business',
  description: 'CRM, invoicing, payments, employees, payroll, POS, and an AI assistant — pick exactly the modules your business needs, one login, built for Canadian businesses.',
  openGraph: {
    title: 'Bario One™ — The AI-powered operating system for your business',
    description: 'Everything your business needs to operate, automate, and grow — powered by AI. Pay only for the modules you use.',
    url: 'https://bario.ca/bario-one',
    siteName: 'Bario',
    type: 'website',
  },
}

function ModulePriceCard({ moduleKey }: { moduleKey: BoModuleKey }) {
  const m = BO_MODULES[moduleKey]
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 flex flex-col gap-2 hover:border-[#d4af37]/50 transition-colors">
      <p className="font-semibold text-sm">{m.name}</p>
      <p className="text-xs text-zinc-500 flex-1">{m.description}</p>
      <p className="text-lg font-extrabold text-white">
        ${(m.priceCentsCad / 100).toFixed(0)}
        <span className="text-xs font-medium text-zinc-500">/mo CAD</span>
      </p>
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
            CRM, invoicing, payments, employees, payroll, POS, and an AI assistant — pick exactly the modules your
            business needs, one login, and pay only for what you use.
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

      {/* PRICING — one price per module, real interactive picker lives in the signup form below */}
      <section id="pricing" className="py-20 px-6 sm:px-12 border-b border-zinc-800">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2">Pay only for what you use</h2>
          <p className="text-zinc-400 text-center mb-12">No fixed bundles — turn on exactly the modules your business needs, and add more any time.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {BO_MODULE_KEYS.map((key) => (
              <ModulePriceCard key={key} moduleKey={key} />
            ))}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 flex flex-col gap-2 hover:border-[#d4af37]/50 transition-colors">
              <p className="font-semibold text-sm">Need it all, or something custom?</p>
              <p className="text-xs text-zinc-500 flex-1">White-label, a dedicated database, or custom integrations — let&apos;s talk.</p>
              <a
                href="mailto:sales@bario.ca?subject=Bario%20One%20Enterprise"
                className="text-center rounded-lg border border-[#d4af37] text-[#d4af37] hover:bg-[#d4af37] hover:text-black font-semibold text-sm px-4 py-2 transition-colors"
              >
                Contact sales
              </a>
            </div>
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
