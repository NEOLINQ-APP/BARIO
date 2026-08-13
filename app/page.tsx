// app/page.tsx
// Bario.ca homepage — a real overview page linking to dedicated product
// pages (Hosting, X-Drive, VPS), not one long scroll with every feature,
// price, and FAQ crammed in. Matches the same multi-page philosophy Sky
// now builds into every customer site.

import DomainChecker from '@/components/DomainChecker'
import PricingAssistant from '@/components/PricingAssistant'
import SiteNav from '@/components/SiteNav'
import SiteFooter from '@/components/SiteFooter'

const HOMEPAGE_TITLE = 'Bario — Cloud Hosting Built for Speed. Powered by AI.'
const HOMEPAGE_DESCRIPTION =
  "Deploy websites in seconds with Bario's AI builder, or spin up a Bario Cloud VPS server in minutes. Secure, high-performance infrastructure for Canadian businesses."

export const metadata = {
  title: HOMEPAGE_TITLE,
  description: HOMEPAGE_DESCRIPTION,
  openGraph: {
    title: HOMEPAGE_TITLE,
    description: HOMEPAGE_DESCRIPTION,
    url: 'https://bario.ca',
    siteName: 'Bario',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: HOMEPAGE_TITLE,
    description: HOMEPAGE_DESCRIPTION,
  },
}

export default function Home() {
  return (
    <main className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased selection:bg-cyan-500 selection:text-slate-950">

      <SiteNav active="home" />

      {/* HERO + DOMAIN SEARCH */}
      <section className="relative overflow-hidden py-20 px-6 sm:px-12 border-b border-slate-200 dark:border-slate-800/80">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-cyan-500/10 blur-[130px] rounded-full pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center space-y-8 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-medium">
            <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
            Hosting, managed DNS, an AI website builder, storage, and VPS servers — one account
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight">
            Cloud hosting built for speed. <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Powered by AI.</span>
          </h1>

          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Describe your business and publish a live site in seconds with our AI builder (Sky) — or spin up a Bario
            Cloud VPS server in minutes. Search a domain below to get started, connect one you already own, and we'll
            manage the DNS for you.
          </p>

          <DomainChecker />

          <div className="pt-6 border-t border-slate-200 dark:border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-medium text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
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
          <p className="text-slate-600 dark:text-slate-400">Three products, one login. Explore each below.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <a href="/hosting" className="group bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 p-8 rounded-2xl space-y-4 transition-colors">
            <div className="text-3xl">🤖</div>
            <h3 className="font-bold text-xl text-slate-900 dark:text-white">AI Website Builder &amp; Hosting</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Describe your business, Sky builds the site. Free hosting, managed DNS, premium templates. Plans from $19/mo.
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-400 group-hover:gap-2.5 transition-all">
              See hosting &amp; pricing →
            </span>
          </a>

          <a href="/storage" className="group bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 p-8 rounded-2xl space-y-4 transition-colors">
            <div className="text-3xl">🗂️</div>
            <h3 className="font-bold text-xl text-slate-900 dark:text-white">X-Drive Storage</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Photos, videos, and files — upload once, use anywhere on your site. Free 10GB, Family Sharing included on paid tiers.
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-400 group-hover:gap-2.5 transition-all">
              See storage plans →
            </span>
          </a>

          <a href="/vps" className="group bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 p-8 rounded-2xl space-y-4 transition-colors">
            <div className="text-3xl">🖥️</div>
            <h3 className="font-bold text-xl text-slate-900 dark:text-white">VPS Servers</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Self-managed servers, full root access, on enterprise-grade infrastructure. Monthly, yearly, or multi-year billing.
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-400 group-hover:gap-2.5 transition-all">
              See VPS plans →
            </span>
          </a>
        </div>
      </section>

      {/* FREE SITE AUDIT AD — lead-gen banner driving signups */}
      <section className="py-16 px-6 sm:px-12 max-w-6xl mx-auto">
        <div className="relative overflow-hidden rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 via-slate-50 dark:via-slate-900/60 to-transparent p-8 sm:p-14">
          <div className="absolute -bottom-24 -right-24 w-[400px] h-[400px] bg-cyan-500/10 blur-[110px] rounded-full pointer-events-none" />

          <div className="relative grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-10 items-center">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-medium">
                🔍 Free Basic Site Audit
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">
                Is your website actually working for you — or just online?
              </h2>
              <p className="text-slate-600 dark:text-slate-400 max-w-lg">
                A live site isn't the same as a healthy one. Run a free Basic Site Audit and see real SEO and
                technical checks against your actual pages — not a guess, and not "looks fine to me." Most sites we
                scan have at least a few fixable issues quietly costing them visitors. Create a free account (60
                seconds, no card) to see exactly where yours stands.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <a
                  href="/site-audit"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-colors"
                >
                  Get My Free Site Audit →
                </a>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-500">
                Basic checks are free with any account. A deeper AI-powered report — the kind of specific findings a
                generic chatbot can't produce, since it can't crawl your site itself — unlocks anytime.
              </p>
            </div>

            <div className="bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-lg shadow-cyan-500/5">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 px-1">
                Sample results
              </div>
              {[
                ['✅', 'HTTPS enabled', 'text-emerald-500'],
                ['✅', 'Mobile-friendly viewport', 'text-emerald-500'],
                ['⚠️', 'Meta description missing', 'text-amber-500'],
                ['⚠️', '3 images with no alt text', 'text-amber-500'],
              ].map(([icon, label, color]) => (
                <div key={label} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 text-sm">
                  <span>{icon}</span>
                  <span className={`font-medium ${color} dark:brightness-125`}>{label}</span>
                </div>
              ))}
              <div className="relative mt-2 px-3 py-4 rounded-lg border border-dashed border-cyan-500/30 bg-cyan-500/5 text-center">
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">🔒 12 more checks + AI action plan</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Sign up free to see your real report</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY CHOOSE BARIO */}
      <section className="py-20 px-6 sm:px-12 max-w-6xl mx-auto border-t border-slate-200 dark:border-slate-800/80">
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
          <h2 className="text-3xl font-extrabold sm:text-4xl">Why choose Bario</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
          {[
            ['⚡', 'NVMe SSD storage', 'Every Bario Cloud server runs on fast NVMe disks.'],
            ['🤖', 'AI website builder included', 'Sky builds and edits your site from plain-language requests — free to start.'],
            ['🔒', 'Free SSL certificates', 'Every bario.ca site and 1-Click WordPress server gets HTTPS automatically.'],
            ['🌐', 'Managed DNS', 'Connect a domain you own and manage every record from one dashboard.'],
            ['📦', 'One-click WordPress', 'A full WordPress install, database, and HTTPS — ready in minutes.'],
            ['🛡️', 'DDoS-protected infrastructure', "Bario Cloud servers inherit Hetzner's network-level DDoS mitigation."],
            ['🚚', 'Free website migration', "We'll move your existing site over at no cost."],
            ['🇨🇦', 'Canadian owned & operated', 'Support and billing, based in Canada.'],
          ].map(([icon, title, desc]) => (
            <div key={title} className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-5 rounded-xl space-y-2">
              <div className="text-2xl">{icon}</div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">{title}</h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <SiteFooter />
      <PricingAssistant />
    </main>
  )
}
