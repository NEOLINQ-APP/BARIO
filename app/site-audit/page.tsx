import SiteAuditTool from '@/components/SiteAuditTool'

export const metadata = {
  title: 'Free Site Health & Static-Readiness Audit — bario.ca',
  description: "Paste your website's URL and see how many pages it has, how fast it loads, and what's running under the hood — free, no signup required.",
}

export default function SiteAuditPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-cyan-500 selection:text-slate-950">
      <nav className="border-b border-slate-800/80 px-6 sm:px-12 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <a href="/" className="flex items-center gap-2 font-extrabold text-xl tracking-tight text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bario-icon-64.png" alt="Bario" className="h-8 w-8" />
          <span className="text-cyan-400">bario</span>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">.ca</span>
        </a>
        <a href="/login" className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 transition-colors text-sm font-medium">
          Client Portal
        </a>
      </nav>

      <section className="py-20 px-6 sm:px-12">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-4">
            Free Site Health &amp; Static-Readiness Audit
          </h1>
          <p className="text-slate-400">
            Paste your website's URL — we'll check how many pages it has, how fast it actually loads, and what's
            running under the hood. No signup, no cost, takes a few seconds.
          </p>
        </div>

        <SiteAuditTool />

        <p className="text-xs text-slate-600 text-center mt-10 max-w-md mx-auto">
          This audit only reads your site's public pages — nothing is changed, copied, or stored. Migrating your full
          site is a paid Bario feature; the audit itself is always free.
        </p>
      </section>

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
