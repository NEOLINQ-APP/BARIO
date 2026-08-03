import { CURRENT_SANDBOX_POLICY_VERSION } from '@/lib/legalVersion'

export const metadata = {
  title: 'Bario Build — Acceptable Use Policy',
}

export default function SandboxAupPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <a href="/" className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">← bario.ca</a>
          <h1 className="text-2xl font-bold mt-4">Bario Build — Acceptable Use Policy</h1>
          <p className="text-xs text-slate-500 mt-2">Version {CURRENT_SANDBOX_POLICY_VERSION}</p>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-200">
          <strong>Draft, pending legal review.</strong> This page describes the terms in plain language but has not yet
          been reviewed and finalized by a lawyer. Do not treat this as final legal advice.
        </div>

        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">1. What Bario Build does</h2>
          <p>
            Bario Build lets an AI write and run real project code — actual files, actual shell commands — inside a
            sandboxed environment on Bario's own infrastructure, and gives you a live preview of what it builds.
            This is different from Bario's website builder: code you describe actually executes.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">2. Prohibited uses</h2>
          <p>You agree not to use Bario Build's sandbox to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Mine cryptocurrency, run denial-of-service tools, port-scan, or attack any other system.</li>
            <li>Attempt to break out of the sandbox's isolation, access the host system, or interfere with other customers' sandboxes.</li>
            <li>Send spam or bulk unsolicited email/messages from the sandbox.</li>
            <li>Build or run illegal content or software of any kind.</li>
          </ul>
          <p>
            Every sandbox runs under strict resource and network limits and is automatically stopped past its usage
            caps. Bario may suspend or terminate your access, without prior notice in cases of active harm or legal
            risk, for a violation of this policy.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">3. Your responsibility</h2>
          <p>
            You are solely responsible for the code you have the AI generate and run, and for any application you
            publish. Bario does not review generated code for correctness, security, or legality before it runs.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">4. No uptime/output guarantee</h2>
          <p>
            Sandbox sessions and published apps are best-effort — they may be restarted, may fail, or may be reaped
            after a period of inactivity. Keep your own copies of anything important.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">5. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, Bario's total liability arising from your use of Bario Build is
            limited to the fees/credits you paid in the billing cycle giving rise to the claim. Bario is not liable
            for indirect, incidental, or consequential damages arising from code you had generated or ran.
          </p>
        </section>

        <p className="text-xs text-slate-500 dark:text-slate-600 pt-4 border-t border-slate-200 dark:border-slate-800">
          Questions about this policy? Contact hello@bario.ca.
        </p>
      </div>
    </main>
  )
}
