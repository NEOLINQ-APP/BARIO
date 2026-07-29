// app/page.tsx
// Bario.ca – Nexus Build – Next.js 14 + Tailwind

import PricingSection from '@/components/PricingSection'
import DomainChecker from '@/components/DomainChecker'
import PricingAssistant from '@/components/PricingAssistant'

export const metadata = {
  title: "Bario — AI website builder & hosting for Canadian businesses",
  description: "Describe your business and Bario's AI builds you a live, editable website in seconds. Publish free to a bario.ca subdomain or connect your own domain. Edmonton / Vancouver.",
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
          <a href="#domains" className="text-slate-400 hover:text-white transition-colors">Domains &amp; DNS</a>
          <a href="#features" className="text-slate-400 hover:text-white transition-colors">Hosting</a>
          <a href="#media-library" className="text-slate-400 hover:text-white transition-colors">X-Drive</a>
          <a href="#pricing" className="text-slate-400 hover:text-white transition-colors">Pricing</a>
          <a href="/site-audit" className="text-slate-400 hover:text-white transition-colors">Free Site Audit</a>
          <a href="#faq" className="text-slate-400 hover:text-white transition-colors">FAQ</a>
          <a href="/login" className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 transition-colors">
            Client Portal
          </a>
        </div>
      </nav>

      {/* 1. HERO + DOMAIN SEARCH */}
      <section id="domains" className="relative overflow-hidden py-20 px-6 sm:px-12 border-b border-slate-800/80">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-cyan-500/10 blur-[130px] rounded-full pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center space-y-8 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-medium">
            <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
            Hosting, managed DNS, and an AI website builder — one account
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
            <div className="flex items-center justify-center gap-1.5"><span className="text-cyan-400">🇨🇦</span> Edmonton &amp; Vancouver based</div>
          </div>
        </div>
      </section>

      {/* 2. FEATURES GRID */}
      <section id="features" className="py-20 px-6 sm:px-12 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
          <h2 className="text-3xl font-extrabold sm:text-4xl">Hosting, DNS, and a site builder — together</h2>
          <p className="text-slate-400">Everything a small business needs to get online, in one account.</p>
        </div>

        {/* Illustrative preview of the AI builder in action */}
        <div className="max-w-2xl mx-auto mb-16 bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-2xl backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <span className="text-xs text-slate-500 font-mono">Zeus — Bario AI builder</span>
          </div>
          <div className="space-y-3 pt-2 text-sm">
            <div className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-300">
              "Build a site for my Edmonton coffee roastery, warm earthy colors"
            </div>
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-3 py-2 text-cyan-300 text-xs">
              Built your hero, menu, and story sections with a warm palette. Ready to publish to <span className="font-mono">yourroastery.bario.ca</span> whenever you are.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-xl space-y-3 hover:border-slate-700 transition-colors">
            <div className="text-2xl">🤖</div>
            <h3 className="font-bold text-lg text-white">AI builder</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Describe what you want in plain language — Zeus writes the copy, picks a theme, and edits any section on request.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-xl space-y-3 hover:border-slate-700 transition-colors">
            <div className="text-2xl">🌐</div>
            <h3 className="font-bold text-lg text-white">Free hosting</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Every site gets a free <code className="text-cyan-400 text-xs">yourbusiness.bario.ca</code> subdomain with automatic SSL, live the moment you publish.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-xl space-y-3 hover:border-slate-700 transition-colors">
            <div className="text-2xl">🧭</div>
            <h3 className="font-bold text-lg text-white">Managed DNS &amp; nameservers</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Connect a domain you already own, point its nameservers at us, and manage A/CNAME/MX/TXT records from your dashboard — no registrar dashboards to juggle.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-xl space-y-3 hover:border-slate-700 transition-colors">
            <div className="text-2xl">🗂️</div>
            <h3 className="font-bold text-lg text-white">Premium templates included</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Full custom-designed templates across restaurants, ecommerce, and more — included free with your subscription, ready to edit and publish.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-xl space-y-3 hover:border-slate-700 transition-colors">
            <div className="text-2xl">📈</div>
            <h3 className="font-bold text-lg text-white">SEO & analytics</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Set your page title, description, and Google Analytics ID right from the builder — no extra setup.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-xl space-y-3 hover:border-slate-700 transition-colors">
            <div className="text-2xl">🎨</div>
            <h3 className="font-bold text-lg text-white">Your brand, your look</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Custom theme colors and favicon upload, so your site looks like your business, not a template.
            </p>
          </div>
        </div>
      </section>

      {/* 2.5 MEDIA LIBRARY SPOTLIGHT */}
      <section id="media-library" className="py-20 px-6 sm:px-12 border-t border-slate-800/80 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-cyan-500/5 blur-[140px] rounded-full pointer-events-none" />
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-14 items-center relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-widest mb-5">
              🆕 New
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold leading-tight mb-4">
              Your X-Drive — <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">every photo, video, and file, in one place.</span>
            </h2>
            <p className="text-slate-400 mb-6 leading-relaxed">
              Upload once, use anywhere on your Bario site. Install it to your phone's home screen for quick uploads on the go, and share your storage with your family at no extra cost.
            </p>
            <ul className="space-y-3 text-sm text-slate-300 mb-8">
              <li className="flex items-start gap-2"><span className="text-cyan-400 mt-0.5">✓</span> Starts free — 10GB, no credit card</li>
              <li className="flex items-start gap-2"><span className="text-cyan-400 mt-0.5">✓</span> Upgrade anytime, from 50GB up to 12TB</li>
              <li className="flex items-start gap-2"><span className="text-cyan-400 mt-0.5">✓</span> Family Sharing — up to 5 people, one plan, no extra cost</li>
              <li className="flex items-start gap-2"><span className="text-cyan-400 mt-0.5">✓</span> Installs like an app — no App Store needed</li>
            </ul>
            <div className="flex flex-wrap gap-4">
              <a href="/media" className="px-6 py-3 rounded-xl font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-colors">
                Open X-Drive
              </a>
              <a href="/storage" className="px-6 py-3 rounded-xl font-semibold border border-slate-700 text-slate-200 hover:border-slate-600 transition-colors">
                See storage plans
              </a>
            </div>
            <p className="text-xs text-slate-500 mt-4">
              How to get it: log in → Dashboard → <span className="text-slate-300">X-Drive</span>. Already have an account? <a href="/login" className="underline hover:text-slate-300">Log in</a> to start uploading. Storage is billed separately from your <a href="/#pricing" className="underline hover:text-slate-300">hosting plan</a>.
            </p>
          </div>

          {/* Real photo (family sharing photos together) with the product preview layered on top */}
          <div className="relative pb-8 pr-6">
            <div className="rounded-2xl overflow-hidden border border-slate-800 shadow-2xl relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1713942590392-598b193afb1a?auto=format&fit=crop&w=1200&q=80&crop=faces,entropy"
                alt="A family looking through shared photos together on a phone"
                className="w-full h-[420px] object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/5 to-transparent" />
            </div>

            <div className="absolute -bottom-2 -right-2 sm:right-0 w-64 bg-slate-900/95 border border-slate-800 rounded-xl p-4 shadow-2xl backdrop-blur-md space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-red-500/80" />
                  <div className="w-2 h-2 rounded-full bg-yellow-500/80" />
                  <div className="w-2 h-2 rounded-full bg-green-500/80" />
                </div>
                <span className="text-[10px] text-slate-500 font-mono">bario.ca/media</span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-slate-200">Plus <span className="text-cyan-400">(family)</span></span>
                <span className="text-slate-500">34/100 GB</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                <div className="h-full bg-cyan-400" style={{ width: '34%' }} />
              </div>
              <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                <div className="aspect-square rounded-md bg-gradient-to-br from-cyan-500/30 to-blue-600/20 border border-slate-800 flex items-center justify-center text-sm">🖼️</div>
                <div className="aspect-square rounded-md bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-slate-800 flex items-center justify-center text-sm">🎬</div>
                <div className="aspect-square rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center text-sm text-slate-500">📁</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. PRICING SECTION */}
      <section id="pricing" className="py-20 px-6 sm:px-12 border-t border-slate-800/80 bg-slate-900/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <h2 className="text-3xl font-extrabold sm:text-4xl">Simple pricing — CAD</h2>
            <p className="text-slate-400">Scale seamlessly as your site grows.</p>
          </div>

          <PricingSection />
        </div>
      </section>

      {/* 4. FAQ SECTION */}
      <section id="faq" className="py-20 px-6 sm:px-12 max-w-4xl mx-auto border-t border-slate-800/80">
        <h2 className="text-3xl font-extrabold text-center mb-12">Frequently Asked Questions</h2>
        <div className="space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-white">Do I need to code?</h3>
            <p className="text-slate-400 text-sm">No. Bario is fully visual — describe what you want and Zeus builds it.</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-white">Is building and hosting actually free?</h3>
            <p className="text-slate-400 text-sm">Yes — anyone can build and publish a site at no cost. Free sites show a small "Made with Bario" badge; any paid plan lets you remove it.</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-white">Can I use my own domain?</h3>
            <p className="text-slate-400 text-sm">Yes, on Business and Agency. Every plan also gets a free bario.ca subdomain. Point your domain's nameservers at us and we handle DNS from there — no manual record editing required.</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-white">Where is data hosted?</h3>
            <p className="text-slate-400 text-sm">Canada-first hosting, PIPEDA-aware.</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-white">Can I buy a new domain through Bario?</h3>
            <p className="text-slate-400 text-sm">Not yet — domain registration is coming soon. Today you can connect a domain you already own and we'll manage its DNS for you.</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-white">Do you offer business email?</h3>
            <p className="text-slate-400 text-sm">Not yet — custom email addresses on your domain (like you@yourbusiness.com) are coming soon.</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-white">What's X-Drive?</h3>
            <p className="text-slate-400 text-sm">
              Storage for your photos, videos, and files — upload once, use them anywhere on your site. Starts free (10GB), with paid tiers up to 12TB, and Family Sharing (up to 5 people) included free on any paid plan. Install it to your phone's home screen and it works like a real app. Log in, then open <span className="text-slate-300">Dashboard → X-Drive</span> to get started.
            </p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-800/80 py-10 text-center text-sm text-slate-500">
        © 2026 bario.ca • hello@bario.ca • Edmonton, AB / Vancouver, BC<br />
        A Unique Group inc. product<br />
        <a href="/terms" className="underline hover:text-slate-300">Terms of Service</a>
        {' · '}
        <a href="/privacy" className="underline hover:text-slate-300">Privacy Policy</a>
      </footer>
      <PricingAssistant />
    </main>
  )
}
