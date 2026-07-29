// app/page.tsx
// Bario.ca homepage — a real overview page linking to dedicated product
// pages (Hosting, X-Drive, VPS), not one long scroll with every feature,
// price, and FAQ crammed in. Matches the same multi-page philosophy Zeus
// now builds into every customer site.

import DomainChecker from '@/components/DomainChecker'
import PricingAssistant from '@/components/PricingAssistant'

export const metadata = {
  title: "Bario — AI website builder & hosting for Canadian businesses",
  description: "Describe your business and Bario's AI builds you a live, editable website in seconds. Publish free to a bario.ca subdomain or connect your own domain.",
}

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-cyan-500 selection:text-slate-950">

      {/* NAVIGATION BAR */}
      <nav className="border-b border-slate-800/80 px-6 sm:px-12 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-2 font-extrabold text-xl tracking-tight text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bario-icon-64.png" alt="Bario" className="h-8 w-8" />
          <span className="text-cyan-400">bario</span>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">.ca</span>
        </div>
        <div className="flex items-center gap-6 text-sm font-medium">
          <a href="/hosting" className="text-slate-400 hover:text-white transition-colors">Hosting</a>
          <a href="/storage" className="text-slate-400 hover:text-white transition-colors">X-Drive</a>
          <a href="/vps" className="text-slate-400 hover:text-white transition-colors">VPS Servers</a>
          <a href="/site-audit" className="text-slate-400 hover:text-white transition-colors">Free Site Audit</a>
          <a href="/login" className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 transition-colors">
            Client Portal
          </a>
        </div>
      </nav>

      {/* HERO + DOMAIN SEARCH */}
      <section className="relative overflow-hidden py-20 px-6 sm:px-12 border-b border-slate-800/80">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-cyan-500/10 blur-[130px] rounded-full pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center space-y-8 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-medium">
            <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
            Hosting, managed DNS, an AI website builder, storage, and VPS servers — one account
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight">
            Host your site. <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Manage your domain.</span> All on Bario.
          </h1>

          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Search a domain below, then build your site with our AI builder (Zeus) and publish it free to a bario.ca
            subdomain — or connect a domain you already own and we'll manage its DNS and nameservers for you.
          </p>

          <DomainChecker />

          <div className="pt-6 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-medium text-slate-400 max-w-2xl mx-auto">
            <div className="flex items-center justify-center gap-1.5"><span className="text-cyan-400">🔒</span> Free SSL, every site</div>
            <div className="flex items-center justify-center gap-1.5"><span className="text-cyan-400">🌐</span> Managed DNS &amp; nameservers</div>
            <div className="flex items-center justify-center gap-1.5"><span className="text-cyan-400">⚡</span> Global edge network</div>
            <div className="flex items-center justify-center gap-1.5"><span className="text-cyan-400">🇨🇦</span> Canadian owned &amp; operated</div>
          </div>
        </div>
      </section>

      {/* PRODUCT OVERVIEW — links out to dedicated pages */}
      <section className="py-20 px-6 sm:px-12 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
          <h2 className="text-3xl font-extrabold sm:text-4xl">Everything your business needs online</h2>
          <p className="text-slate-400">Three products, one login. Explore each below.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <a href="/hosting" className="group bg-slate-900/60 border border-slate-800 hover:border-cyan-500/50 p-8 rounded-2xl space-y-4 transition-colors">
            <div className="text-3xl">🤖</div>
            <h3 className="font-bold text-xl text-white">AI Website Builder &amp; Hosting</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Describe your business, Zeus builds the site. Free hosting, managed DNS, premium templates. Plans from $19/mo.
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-400 group-hover:gap-2.5 transition-all">
              See hosting &amp; pricing →
            </span>
          </a>

          <a href="/storage" className="group bg-slate-900/60 border border-slate-800 hover:border-cyan-500/50 p-8 rounded-2xl space-y-4 transition-colors">
            <div className="text-3xl">🗂️</div>
            <h3 className="font-bold text-xl text-white">X-Drive Storage</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Photos, videos, and files — upload once, use anywhere on your site. Free 10GB, Family Sharing included on paid tiers.
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-400 group-hover:gap-2.5 transition-all">
              See storage plans →
            </span>
          </a>

          <a href="/vps" className="group bg-slate-900/60 border border-slate-800 hover:border-cyan-500/50 p-8 rounded-2xl space-y-4 transition-colors">
            <div className="text-3xl">🖥️</div>
            <h3 className="font-bold text-xl text-white">VPS Servers</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Self-managed servers, full root access, on enterprise-grade infrastructure. Monthly, yearly, or multi-year billing.
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-400 group-hover:gap-2.5 transition-all">
              See VPS plans →
            </span>
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-800/80 py-10 text-center text-sm text-slate-500">
        © 2026 bario.ca • hello@bario.ca<br />
        <a href="/terms" className="underline hover:text-slate-300">Terms of Service</a>
        {' · '}
        <a href="/privacy" className="underline hover:text-slate-300">Privacy Policy</a>
      </footer>
      <PricingAssistant />
    </main>
  )
}
