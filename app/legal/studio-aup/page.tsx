import { CURRENT_STUDIO_POLICY_VERSION } from '@/lib/legalVersion'

export const metadata = {
  title: 'Bario Studio — Acceptable Use Policy',
}

export default function StudioAupPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased px-6 py-16">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <a href="/" className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">← bario.ca</a>
          <h1 className="text-2xl font-bold mt-4">Bario Studio — Acceptable Use Policy</h1>
          <p className="text-xs text-slate-500 mt-2">Version {CURRENT_STUDIO_POLICY_VERSION}</p>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-200">
          <strong>Draft, pending legal review.</strong> This page describes the terms in plain language but has not yet
          been reviewed and finalized by a lawyer. Do not treat this as final legal advice.
        </div>

        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">1. What Studio does</h2>
          <p>
            Studio generates video and voiceover audio from images, prompts, and text you provide, using AI models
            running on Bario's own infrastructure. Generations are metered by credits.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">2. Prohibited uses</h2>
          <p>You agree not to use Studio to generate or upload:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Content depicting a real, identifiable person without their consent — including face-swap onto another person's likeness.</li>
            <li>Sexual, exploitative, or abusive content involving minors, or any non-consensual sexual content.</li>
            <li>Content intended to defame, harass, impersonate, or deceive a specific real person or organization.</li>
            <li>Illegal content of any kind.</li>
          </ul>
          <p>
            Bario may suspend or terminate your access to Studio, without prior notice in cases of active harm or
            legal risk, for a violation of this policy, and may report unlawful content to relevant authorities.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">3. Your responsibility</h2>
          <p>
            You are solely responsible for the inputs you provide and the outputs you generate, publish, or share, and
            for obtaining any necessary consent or rights for images or likenesses you upload.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">4. No output guarantee</h2>
          <p>
            Generation is best-effort — outputs may fail, be lower quality than expected, or take longer than
            expected. Credits charged for a failed generation are refunded automatically.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">5. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, Bario's total liability arising from your use of Studio is limited
            to the credits/fees you paid in the billing cycle giving rise to the claim. Bario is not liable for
            indirect, incidental, or consequential damages arising from your use of generated content.
          </p>
        </section>

        <p className="text-xs text-slate-500 dark:text-slate-600 pt-4 border-t border-slate-200 dark:border-slate-800">
          Questions about this policy? Contact hello@bario.ca.
        </p>
      </div>
    </main>
  )
}
