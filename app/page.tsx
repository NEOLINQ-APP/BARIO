// app/page.tsx
// Bario.ca – Nexus Build – Next.js 14 + Tailwind

import PricingButton from '@/components/PricingButton'

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
          <span className="text-cyan-400">bario</span>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">.ca</span>
        </div>
        <div className="flex items-center gap-6 text-sm font-medium">
          <a href="#features" className="text-slate-400 hover:text-white transition-colors">Features</a>
          <a href="#pricing" className="text-slate-400 hover:text-white transition-colors">Pricing</a>
          <a href="#faq" className="text-slate-400 hover:text-white transition-colors">FAQ</a>
          <a href="/login" className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 transition-colors">
            Log in
          </a>
        </div>
      </nav>

      {/* 1. HERO SECTION */}
      <section className="relative overflow-hidden py-20 px-6 sm:px-12 border-b border-slate-800/80">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10">

          <div className="space-y-6 text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-medium">
              <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
              AI website builder, built for small business
            </div>

            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight">
              Describe your business. <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Get a live website.</span>
            </h1>

            <p className="text-lg text-slate-400 max-w-xl">
              Bario's AI builder (Zeus) writes, designs, and edits your site live in the browser — no code.
              Publish free to a bario.ca subdomain or connect your own domain.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
              <a
                href="#pricing"
                className="inline-flex justify-center items-center px-6 py-3.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition-all shadow-lg shadow-cyan-500/20"
              >
                Build your site
              </a>
              <a
                href="#features"
                className="inline-flex justify-center items-center px-6 py-3.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 font-semibold transition-all"
              >
                See how it works
              </a>
            </div>

            <div className="pt-6 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs font-medium text-slate-400">
              <div className="flex items-center gap-1.5"><span className="text-cyan-400">⚡</span> Live in the browser</div>
              <div className="flex items-center gap-1.5"><span className="text-cyan-400">🔒</span> Free SSL, every site</div>
              <div className="flex items-center gap-1.5"><span className="text-cyan-400">🇨🇦</span> PIPEDA-aware</div>
            </div>
          </div>

          {/* Right column: chat preview, matches what the builder actually does */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-6 shadow-2xl backdrop-blur-md space-y-4">
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

            <div className="font-mono text-xs space-y-1.5 pt-3 text-slate-400 border-t border-slate-800/60">
              <p className="text-emerald-400">✔ Free bario.ca subdomain</p>
              <p className="text-emerald-400">✔ Connect your own domain anytime</p>
              <p className="text-slate-500">Edit any section live — no redeploys, no waiting</p>
            </div>
          </div>

        </div>
      </section>

      {/* 2. FEATURES GRID */}
      <section id="features" className="py-20 px-6 sm:px-12 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
          <h2 className="text-3xl font-extrabold sm:text-4xl">Everything a small business site needs</h2>
          <p className="text-slate-400">Build it with AI, tune it by hand, and publish when it's ready.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
              Every site gets a free <code className="text-cyan-400 text-xs">yourbusiness.bario.ca</code> subdomain with SSL, or connect your own domain.
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

      {/* 3. PRICING SECTION */}
      <section id="pricing" className="py-20 px-6 sm:px-12 border-t border-slate-800/80 bg-slate-900/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <h2 className="text-3xl font-extrabold sm:text-4xl">Simple pricing — CAD</h2>
            <p className="text-slate-400">Scale seamlessly as your site grows.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-white">Starter</h3>
                <div className="text-4xl font-extrabold text-white">$19 <span className="text-sm text-slate-400 font-normal">/mo CAD</span></div>
                <ul className="space-y-3 text-sm text-slate-300">
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> 1 site</li>
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> 75 AI credits/mo</li>
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> Live editor</li>
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> Free bario.ca subdomain</li>
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> Email support</li>
                </ul>
              </div>
              <PricingButton plan="starter" label="Choose Starter" />
            </div>

            <div className="bg-slate-900 border-2 border-cyan-500 rounded-2xl p-8 flex flex-col justify-between space-y-6 relative shadow-2xl shadow-cyan-500/10">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 bg-cyan-500 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-full">
                Most popular
              </div>
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-white">Business</h3>
                <div className="text-4xl font-extrabold text-white">$49 <span className="text-sm text-slate-400 font-normal">/mo CAD</span></div>
                <ul className="space-y-3 text-sm text-slate-300">
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> 5 sites</li>
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> 200 AI credits/mo</li>
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> Custom domain</li>
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> Marketing asset pack</li>
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> Priority support</li>
                </ul>
              </div>
              <PricingButton plan="business" label="Choose Business" />
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-white">Agency</h3>
                <div className="text-4xl font-extrabold text-white">$149 <span className="text-sm text-slate-400 font-normal">/mo CAD</span></div>
                <ul className="space-y-3 text-sm text-slate-300">
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> Unlimited sites</li>
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> 750 AI credits/mo</li>
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> White-label export</li>
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> Client seats</li>
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> CA phone support</li>
                </ul>
              </div>
              <PricingButton plan="agency" label="Choose Agency" />
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-6 text-center">Prices in CAD. GST/HST extra where applicable. Cancel anytime. 1 AI credit = 1 chat message to Zeus — manual text edits are always free.</p>
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
            <h3 className="font-bold text-lg text-white">Can I use my own domain?</h3>
            <p className="text-slate-400 text-sm">Yes, on Business and Agency. Every plan also gets a free bario.ca subdomain.</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-white">Where is data hosted?</h3>
            <p className="text-slate-400 text-sm">Canada-first hosting, PIPEDA-aware.</p>
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
    </main>
  )
}
