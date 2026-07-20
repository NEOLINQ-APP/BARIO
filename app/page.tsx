// app/page.tsx
// Bario.ca – Nexus Build – Next.js 14 + Tailwind
// Drop into a fresh Next.js app with Tailwind configured

import PricingButton from '@/components/PricingButton'

export const metadata = {
  title: "Bario — Live website builder for Canadian businesses",
  description: "Design and edit your website live in the browser. Bario.ca helps you build sites and marketing assets to grow your business – no code needed. Edmonton / Vancouver."
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0b111c] text-zinc-100 antialiased">
      <header className="max-w-6xl mx-auto px-6 pt-20 pb-16 md:pt-28 md:pb-24">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-zinc-400">bario.ca • Edmonton / Vancouver</div>
          <a href="/login" className="text-sm text-zinc-400 hover:text-zinc-200">Log in</a>
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight max-w-3xl">
          Build your website live. No code, no waiting.
        </h1>
        <p className="mt-5 text-lg text-zinc-300 max-w-2xl">
          Bario is a live online website builder and marketing editor. Design sites and marketing assets to grow your business and personal brand — right in your browser.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="mailto:hello@bario.ca?subject=Start my Bario site" className="px-5 py-3 rounded-xl font-semibold bg-[#f59e0b] text-[#1a1200]">Build with Bario</a>
          <a href="#how" className="px-5 py-3 rounded-xl border border-zinc-700 text-zinc-200">See how it works</a>
        </div>
        <p className="mt-3 text-sm text-zinc-500">Canadian-hosted • PIPEDA-aware • No lock-in</p>
      </header>

      <section id="how" className="max-w-6xl mx-auto px-6 pb-20 grid md:grid-cols-3 gap-6">
        {[
          {t:"Design live", d:"Drag, type, publish. See changes instantly in the browser."},
          {t:"Marketing built-in", d:"Landing pages, social graphics, email headers — one editor."},
          {t:"Own your site", d:"Export clean code anytime. Host with us or take it with you."},
        ].map(c => (
          <div key={c.t} className="rounded-2xl border border-zinc-800 bg-[#131b2a] p-6">
            <div className="font-semibold text-zinc-100">{c.t}</div>
            <p className="text-sm text-zinc-400 mt-2">{c.d}</p>
          </div>
        ))}
      </section>

      <section id="pricing" className="max-w-6xl mx-auto px-6 pb-20">
        <h2 className="text-2xl md:text-3xl font-bold mb-6">Simple pricing — CAD</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-zinc-800 p-6 bg-[#131b2a]">
            <div className="text-zinc-400 text-sm">Starter</div>
            <div className="text-3xl font-bold mt-1">$19<span className="text-base font-normal text-zinc-400">/mo</span></div>
            <ul className="text-sm text-zinc-300 mt-4 space-y-2">
              <li>1 site</li><li>Live editor</li><li>Basic templates</li><li>Email support</li>
            </ul>
            <PricingButton plan="starter" label="Choose Starter" />
          </div>
          <div className="rounded-2xl border-2 border-[#f59e0b] p-6 bg-[#17131a] relative">
            <div className="text-xs uppercase tracking-wide text-[#f59e0b] font-bold">Most popular</div>
            <div className="text-zinc-300 text-sm mt-1">Business</div>
            <div className="text-3xl font-bold mt-1">$49<span className="text-base font-normal text-zinc-400">/mo</span></div>
            <ul className="text-sm text-zinc-300 mt-4 space-y-2">
              <li>5 sites</li><li>Marketing asset pack</li><li>Custom domain</li><li>Priority support</li>
            </ul>
            <PricingButton plan="business" label="Choose Business" />
          </div>
          <div className="rounded-2xl border border-zinc-800 p-6 bg-[#131b2a]">
            <div className="text-zinc-400 text-sm">Agency</div>
            <div className="text-3xl font-bold mt-1">$149<span className="text-base font-normal text-zinc-400">/mo</span></div>
            <ul className="text-sm text-zinc-300 mt-4 space-y-2">
              <li>Unlimited sites</li><li>White-label export</li><li>Client seats</li><li>CA phone support</li>
            </ul>
            <PricingButton plan="agency" label="Choose Agency" />
          </div>
        </div>
        <p className="text-xs text-zinc-500 mt-3">Prices in CAD. GST/HST extra where applicable. Cancel anytime.</p>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-24">
        <h2 className="text-2xl font-bold mb-4">FAQ</h2>
        <div className="space-y-4 text-zinc-300 text-sm">
          <p><strong>Do I need to code?</strong> No. Bario is fully visual. Export clean code if you want it.</p>
          <p><strong>Can I use my own domain?</strong> Yes, on Business and Agency.</p>
          <p><strong>Where is data hosted?</strong> Canada-first hosting, PIPEDA-aware.</p>
        </div>
      </section>

      <footer className="border-t border-zinc-800 py-10 text-center text-sm text-zinc-500">
        © 2026 bario.ca • hello@bario.ca • Edmonton, AB / Vancouver, BC<br/>
        A Unique Group inc. product
      </footer>
    </main>
  )
}
