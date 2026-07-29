import { CURRENT_VPS_POLICY_VERSION } from '@/lib/legalVersion'

export const metadata = {
  title: 'Bario VPS — Acceptable Use Policy & Service Terms',
}

export default function VpsAupPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <a href="/" className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">← bario.ca</a>
          <h1 className="text-2xl font-bold mt-4">Bario VPS — Acceptable Use Policy &amp; Service Terms</h1>
          <p className="text-xs text-slate-500 mt-2">Version {CURRENT_VPS_POLICY_VERSION}</p>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-200">
          <strong>Draft, pending legal review.</strong> This page describes the terms in plain language and covers what
          a VPS agreement needs to address, but has not yet been reviewed and finalized by a lawyer. Do not treat this
          as final legal advice.
        </div>

        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">1. What you're getting</h2>
          <p>
            A virtual private server ("VPS") provided on an <strong>as-is, self-managed</strong> basis. You receive
            root/administrator access and are solely responsible for the operating system, software, security
            configuration, updates beyond the automatic security patching enabled by default, data, and backups on
            your server — Bario does not monitor, manage, or back up the contents of your server unless you've
            purchased the optional backup add-on.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">2. Acceptable use</h2>
          <p>You agree not to use your server for, or to host, any of the following:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Illegal content or activity of any kind.</li>
            <li>Spam, unsolicited bulk email, or email relay abuse.</li>
            <li>Malware, botnets, denial-of-service tools, or attacks against any other system.</li>
            <li>Any activity that abuses shared infrastructure or degrades service for other customers.</li>
          </ul>
          <p>
            Bario may suspend or terminate your server, without prior notice in cases of active harm or legal risk,
            for a violation of this policy.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">3. Service level</h2>
          <p>
            This is a best-effort service at this price point — no uptime SLA (service level guarantee) is offered.
            Bario relies on third-party infrastructure providers for the underlying hardware and network; while we
            select reputable providers, we cannot guarantee uninterrupted availability.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">4. Payment, suspension &amp; cancellation</h2>
          <p>
            Servers are billed in advance for the billing cycle you choose (monthly, yearly, or multi-year). If a
            payment fails, your subscription enters a grace period matching our payment processor's normal retry
            schedule; if payment is not resolved, your server is suspended (powered off, data retained) for a limited
            window before it is permanently removed. Canceling your subscription removes your server and its data —
            this cannot be undone once processed.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">5. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, Bario's total liability arising from your use of this service is
            limited to the fees you paid for the service in the billing cycle giving rise to the claim. Bario is not
            liable for indirect, incidental, or consequential damages, including loss of data, profits, or business,
            arising from your use of the server.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">6. Indemnification</h2>
          <p>
            You agree to indemnify and hold Bario harmless from any claim, damage, or expense (including legal fees)
            arising from content you host or actions taken using your server, including claims from third parties
            affected by activity originating from your server.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">7. Your responsibility for data</h2>
          <p>
            You are responsible for maintaining your own backups unless you've purchased the backup add-on. Bario is
            not liable for data loss resulting from your own configuration, software, or failure to maintain backups.
          </p>
        </section>

        <p className="text-xs text-slate-500 dark:text-slate-600 pt-4 border-t border-slate-200 dark:border-slate-800">
          Questions about this policy? Contact hello@bario.ca.
        </p>
      </div>
    </main>
  )
}
