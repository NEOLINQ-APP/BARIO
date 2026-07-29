// app/vps/page.tsx
// Dedicated marketing/pricing page for Bario VPS — self-managed servers,
// separate product from hosting/site plans and from X-Drive storage.

import VpsPricingSection from '@/components/VpsPricingSection'
import PricingAssistant from '@/components/PricingAssistant'
import SiteNav from '@/components/SiteNav'
import SiteFooter from '@/components/SiteFooter'

export const metadata = {
  title: 'VPS Servers — Bario',
  description: 'Self-managed VPS servers on enterprise-grade infrastructure. Small, Medium, and Large tiers, billed monthly, yearly, or multi-year at a discount.',
}

export default function VpsPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased selection:bg-cyan-500 selection:text-slate-950">
      <SiteNav active="vps" />

      {/* HERO */}
      <section className="relative overflow-hidden py-20 px-6 sm:px-12 border-b border-slate-200 dark:border-slate-800/80">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-cyan-500/10 blur-[130px] rounded-full pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center space-y-6 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-medium">
            <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
            Self-managed VPS — a separate product from your Bario website
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight">
            VPS servers, <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">on your own account.</span>
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Full root access on enterprise-grade infrastructure. Bring your own SSH key or get a one-time password,
            pick your billing cycle, and it's ready in minutes — same login as the rest of Bario.
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-2">
            <a href="/signup" className="px-6 py-3 rounded-xl font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-colors">
              Order a server
            </a>
            <a href="#plans" className="px-6 py-3 rounded-xl font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600 transition-colors">
              Compare plans
            </a>
          </div>
        </div>
      </section>

      {/* PLANS */}
      <section id="plans" className="py-20 px-6 sm:px-12 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
          <h2 className="text-3xl font-extrabold sm:text-4xl">Pick a server size</h2>
          <p className="text-slate-600 dark:text-slate-400">Longer commitments cost less per month — pick a billing cycle below to see the difference.</p>
        </div>
        <VpsPricingSection />
      </section>

      {/* HOW IT WORKS */}
      <section className="py-20 px-6 sm:px-12 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-extrabold text-center mb-12">How it works</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto font-bold">1</div>
              <h3 className="font-bold text-slate-900 dark:text-white">Sign up &amp; choose a size</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">Pick a tier and billing cycle from your dashboard, add your SSH key (or request a one-time password).</p>
            </div>
            <div className="text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto font-bold">2</div>
              <h3 className="font-bold text-slate-900 dark:text-white">We provision it</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">Your server is created automatically the moment payment goes through — usually ready within a minute or two.</p>
            </div>
            <div className="text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto font-bold">3</div>
              <h3 className="font-bold text-slate-900 dark:text-white">Connect &amp; manage</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">SSH in with your key, run whatever you need. Manage or cancel anytime from Dashboard → Servers.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-6 sm:px-12 max-w-4xl mx-auto">
        <h2 className="text-3xl font-extrabold text-center mb-12">VPS FAQ</h2>
        <div className="space-y-6">
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Is this managed or self-managed?</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Self-managed — you get full root access and are responsible for your own OS, software, and data.
              Automatic security patching is enabled by default, and an optional backup add-on is available at checkout.
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">What can I run on it?</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Anything you'd run on a normal Linux server — your own websites, apps, databases, or tools. See our Acceptable Use Policy for what's not allowed.</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">How do I access my server?</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Via SSH, using the key you provide at order time — or a one-time root password if you don't have an SSH key yet.</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Can I switch billing cycles later?</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Cancel and re-order at a different cycle from your dashboard — each server is its own subscription, managed from Billing.</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">What happens if a payment fails?</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Your server is suspended (not deleted) after our payment processor's retry attempts are exhausted, giving you time to update your card before anything is removed.</p>
          </div>
        </div>
        <p className="text-xs text-slate-600 text-center mt-10">
          Full terms: <a href="/legal/vps-aup" className="underline">VPS Acceptable Use Policy &amp; Service Terms</a>
        </p>
      </section>

      <SiteFooter />
      <PricingAssistant />
    </main>
  )
}
