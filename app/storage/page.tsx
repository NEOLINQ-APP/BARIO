// app/storage/page.tsx
// A dedicated page for X-Drive (formerly "Media Library") storage plans —
// kept separate from the main hosting/site-plan pricing (#pricing on the
// homepage) since the two were easy for customers to confuse when storage
// was just an in-page anchor next to the site-plan pricing section.

import PricingAssistant from '@/components/PricingAssistant'

export const metadata = {
  title: 'Storage Plans — Bario X-Drive',
  description: "Photo, video, and file storage for your Bario site, separate from your hosting plan. Free 10GB, paid tiers up to 12TB, Family Sharing included free on any paid plan.",
}

const TIERS = [
  { key: 'free', label: 'Free', size: '10 GB', price: '$0', tagline: 'Try it out', family: false },
  { key: 'starter', label: 'Starter', size: '50 GB', price: '$0.99', tagline: 'A few hundred photos & clips', family: true },
  { key: 'plus', label: 'Plus', size: '200 GB', price: '$2.99', tagline: 'Most small businesses & families', family: true, popular: true },
  { key: 'pro', label: 'Pro', size: '2 TB', price: '$9.99', tagline: 'Heavy photo & video use', family: true },
  { key: 'max', label: 'Max', size: '6 TB', price: '$29.99', tagline: 'Professional archives', family: true },
  { key: 'ultra', label: 'Ultra', size: '12 TB', price: '$59.99', tagline: 'High-volume studios', family: true },
]

export default function StoragePlansPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-cyan-500 selection:text-slate-950">
      {/* NAVIGATION BAR */}
      <nav className="border-b border-slate-800/80 px-6 sm:px-12 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <a href="/" className="flex items-center gap-2 font-extrabold text-xl tracking-tight text-white">
          <span className="text-cyan-400">bario</span>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">.ca</span>
        </a>
        <div className="flex items-center gap-6 text-sm font-medium">
          <a href="/#pricing" className="text-slate-400 hover:text-white transition-colors">Hosting Plans</a>
          <a href="/storage" className="text-white">Storage Plans</a>
          <a href="/login" className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 transition-colors">
            Client Portal
          </a>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden py-20 px-6 sm:px-12 border-b border-slate-800/80">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-cyan-500/10 blur-[130px] rounded-full pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center space-y-6 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-sm font-medium">
            <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
            Separate from your hosting plan — storage for your photos &amp; videos
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight">
            X-Drive <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Storage Plans</span>
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Upload once, use anywhere on your Bario site. Starts free, upgrade anytime — and Family Sharing (up to 5 people) is included free on every paid tier, no separate charge.
          </p>
          <div className="flex flex-wrap justify-center gap-4 pt-2">
            <a href="/media" className="px-6 py-3 rounded-xl font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-colors">
              Open X-Drive
            </a>
            <a href="#plans" className="px-6 py-3 rounded-xl font-semibold border border-slate-700 text-slate-200 hover:border-slate-600 transition-colors">
              Compare plans
            </a>
          </div>
        </div>
      </section>

      {/* PLANS GRID */}
      <section id="plans" className="py-20 px-6 sm:px-12 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
          <h2 className="text-3xl font-extrabold sm:text-4xl">Pick a plan</h2>
          <p className="text-slate-400">Prices in CAD, billed monthly. Cancel or change plans anytime from your billing portal.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {TIERS.map((t) => (
            <div
              key={t.key}
              className={`relative flex flex-col justify-between rounded-2xl p-6 space-y-5 ${
                t.popular ? 'bg-slate-900 border-2 border-cyan-500 shadow-2xl shadow-cyan-500/10' : 'bg-slate-900 border border-slate-800'
              }`}
            >
              {t.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 bg-cyan-500 text-slate-950 font-bold text-xs uppercase tracking-wider rounded-full">
                  Most popular
                </div>
              )}
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-white">{t.label}</h3>
                <div className="text-3xl font-extrabold text-white">
                  {t.price}
                  {t.price !== '$0' && <span className="text-sm text-slate-400 font-normal"> /mo CAD</span>}
                </div>
                <div className="text-sm font-semibold text-cyan-400">{t.size}</div>
                <p className="text-xs text-slate-500">{t.tagline}</p>
                <ul className="space-y-2 text-sm text-slate-300 pt-2 border-t border-slate-800">
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> Photos &amp; videos</li>
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> Folder organization</li>
                  <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> Installable app (PWA)</li>
                  {t.family ? (
                    <li className="flex items-center gap-2"><span className="text-cyan-400">✓</span> Family Sharing (5 people)</li>
                  ) : (
                    <li className="flex items-center gap-2 text-slate-500"><span className="text-slate-600">•</span> Family Sharing on paid plans</li>
                  )}
                </ul>
              </div>
              <a
                href="/media"
                className={`w-full text-center px-4 py-2.5 rounded-xl font-semibold transition-colors ${
                  t.popular ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400' : 'border border-slate-700 text-slate-200 hover:border-slate-600'
                }`}
              >
                {t.price === '$0' ? 'Start free' : 'Choose ' + t.label}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="py-20 px-6 sm:px-12 border-t border-slate-800/80 bg-slate-900/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-extrabold text-center mb-12">How to get started</h2>
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto font-bold">1</div>
              <h3 className="font-bold text-white">Log in</h3>
              <p className="text-sm text-slate-400">Or create a free Bario account — no credit card needed to start.</p>
            </div>
            <div className="text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto font-bold">2</div>
              <h3 className="font-bold text-white">Open X-Drive</h3>
              <p className="text-sm text-slate-400">From your Dashboard, or install it to your phone's home screen for one-tap access.</p>
            </div>
            <div className="text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto font-bold">3</div>
              <h3 className="font-bold text-white">Upload &amp; upgrade anytime</h3>
              <p className="text-sm text-slate-400">Start free, pick a paid tier when you need more room — change or cancel from billing anytime.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-6 sm:px-12 max-w-4xl mx-auto">
        <h2 className="text-3xl font-extrabold text-center mb-12">Storage FAQ</h2>
        <div className="space-y-6">
          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-white">Is this the same as my hosting plan?</h3>
            <p className="text-slate-400 text-sm">No — storage is billed separately from your site's hosting plan (Free/Starter/Business/Agency). You can be on any hosting plan, or none, and subscribe to storage independently.</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-white">How does Family Sharing work?</h3>
            <p className="text-slate-400 text-sm">On any paid tier, invite up to 4 others by email. Everyone keeps their own login, and the whole family draws from one pooled storage limit — no extra cost.</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-white">Can I install it like an app?</h3>
            <p className="text-slate-400 text-sm">Yes — open X-Drive in your phone's browser and choose "Add to Home Screen." No App Store needed.</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-white">What happens if I go over my limit?</h3>
            <p className="text-slate-400 text-sm">New uploads are blocked until you free up space or upgrade — nothing you've already uploaded is ever deleted.</p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-xl space-y-2">
            <h3 className="font-bold text-lg text-white">Can I cancel anytime?</h3>
            <p className="text-slate-400 text-sm">Yes, from the billing portal inside X-Drive. Downgrading to Free just pauses new uploads over the free limit — your files stay put.</p>
          </div>
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
