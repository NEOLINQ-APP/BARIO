import SiteAuditTool from '@/components/SiteAuditTool'
import SiteNav from '@/components/SiteNav'
import SiteFooter from '@/components/SiteFooter'

export const metadata = {
  title: 'Free Site Health & Static-Readiness Audit — bario.ca',
  description: "Paste your website's URL and see how many pages it has, how fast it loads, and what's running under the hood — free, no signup required.",
}

export default function SiteAuditPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased selection:bg-cyan-500 selection:text-slate-950">
      <SiteNav active="audit" />

      <section className="py-20 px-6 sm:px-12">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-4">
            Free Site Health &amp; Static-Readiness Audit
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Paste your website's URL — we'll check how many pages it has, how fast it actually loads, and what's
            running under the hood. No signup, no cost, takes a few seconds.
          </p>
        </div>

        <SiteAuditTool />

        <p className="text-xs text-slate-500 dark:text-slate-600 text-center mt-10 max-w-md mx-auto">
          This audit only reads your site's public pages — nothing is changed, copied, or stored. Migrating your full
          site is a paid Bario feature; the audit itself is always free.
        </p>
      </section>

      <SiteFooter />
    </main>
  )
}
