// app/hosting/page.tsx
// Dedicated page for the AI website builder + hosting + site-plan pricing —
// split out of the homepage so bario.ca is a real multi-page site instead
// of one long scroll, matching the same philosophy Sky-built customer
// sites now follow.

import PricingSection from '@/components/PricingSection'
import PricingAssistant from '@/components/PricingAssistant'
import SiteNav from '@/components/SiteNav'
import SiteFooter from '@/components/SiteFooter'

export const metadata = {
  title: 'AI Website Builder & Hosting — Bario',
  description: 'Describe your business and Sky builds you a live, editable website. Free hosting, managed DNS, premium templates, and simple CAD pricing.',
}

export default function HostingPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased selection:bg-cyan-500 selection:text-slate-950">
      <SiteNav active="hosting" />

      {/* HERO */}
      <section className="relative overflow-hidden py-20 px-6 sm:px-12 border-b border-slate-200 dark:border-slate-800/80">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-cyan-500/10 blur-[130px] rounded-full pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center space-y-6 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-medium">
            <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
            AI website builder, hosting, and managed DNS — one account
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight">
            Describe your business. <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Sky builds the site.</span>
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            No code, no templates to fight with — just describe what you want, in plain language, and edit anything by
            asking for changes. Publish free to a bario.ca subdomain, or connect a domain you already own.
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-2">
            <a href="/signup" className="px-6 py-3 rounded-xl font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-colors">
              Start building free
            </a>
            <a href="#pricing" className="px-6 py-3 rounded-xl font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-slate-400 dark:hover:border-slate-600 transition-colors">
              See pricing
            </a>
          </div>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section className="py-20 px-6 sm:px-12 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
          <h2 className="text-3xl font-extrabold sm:text-4xl">Everything a small business needs, in one account</h2>
        </div>

        <div className="max-w-2xl mx-auto mb-16 bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-xl dark:shadow-2xl backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <span className="text-xs text-slate-500 font-mono">Sky — website builder</span>
          </div>
          <div className="space-y-3 pt-2 text-sm">
            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300">
              "Build a site for my coffee roastery, warm earthy colors"
            </div>
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-3 py-2 text-cyan-700 dark:text-cyan-300 text-xs">
              Built your hero, menu, and story sections with a warm palette. Ready to publish to <span className="font-mono">yourroastery.bario.ca</span> whenever you are.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-3 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <div className="text-2xl">🤖</div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">AI builder</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Describe what you want in plain language — Sky writes the copy, picks a theme, and edits any section on request.
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-3 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <div className="text-2xl">🌐</div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Free hosting</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Every site gets a free <code className="text-cyan-400 text-xs">yourbusiness.bario.ca</code> subdomain with automatic SSL, live the moment you publish.
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-3 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <div className="text-2xl">🧭</div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Managed DNS &amp; nameservers</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Connect a domain you already own, point its nameservers at us, and manage A/CNAME/MX/TXT records from your dashboard — no registrar dashboards to juggle.
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-3 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <div className="text-2xl">🗂️</div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Premium templates included</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Full custom-designed templates across restaurants, ecommerce, and more — included free with your subscription, ready to edit and publish.
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-3 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <div className="text-2xl">📈</div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">SEO &amp; analytics</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Set your page title, description, and Google Analytics ID right from the builder — no extra setup.
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-3 hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
            <div className="text-2xl">🎨</div>
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Your brand, your look</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Custom theme colors and favicon upload, so your site looks like your business, not a template.
            </p>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-20 px-6 sm:px-12 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <h2 className="text-3xl font-extrabold sm:text-4xl">Simple pricing — CAD</h2>
            <p className="text-slate-600 dark:text-slate-400">Scale seamlessly as your site grows.</p>
          </div>
          <PricingSection />
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-6 sm:px-12 max-w-4xl mx-auto border-t border-slate-200 dark:border-slate-800/80">
        <h2 className="text-3xl font-extrabold text-center mb-12">Frequently Asked Questions</h2>
        <div className="space-y-6">
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Do I need to code?</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm">No. Bario is fully visual — describe what you want and Sky builds it.</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Is building and hosting actually free?</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Yes — anyone can build and publish a site at no cost. Free sites show a small "Made with Bario" badge; any paid plan lets you remove it.</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Can I use my own domain?</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Yes, on Business and Agency. Every plan also gets a free bario.ca subdomain. Point your domain's nameservers at us and we handle DNS from there — no manual record editing required.</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Where is data hosted?</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Canada-first hosting, PIPEDA-aware.</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Can I buy a new domain through Bario?</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Not yet — domain registration is coming soon. Today you can connect a domain you already own and we'll manage its DNS for you.</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Do you offer business email?</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Yes, on paid plans — once your domain is connected and verified, create real mailboxes like you@yourbusiness.com from the Email tab in your dashboard, with webmail, IMAP, and SMTP access.</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Can I get a website AND a VPS server?</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm">Yes — hosting/site plans and VPS servers are separate products on the same account, billed independently. See <a href="/vps" className="underline">VPS Servers</a>.</p>
          </div>
        </div>
      </section>

      <SiteFooter />
      <PricingAssistant />
    </main>
  )
}
