import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy — Bario',
}

export default function Privacy() {
  return (
    <main className="min-h-screen bg-[#0b111c] text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <a href="/" className="text-sm text-[#f59e0b]">← Back to bario.ca</a>
        <h1 className="text-3xl font-bold mt-6 mb-2">Privacy Policy</h1>
        <p className="text-sm text-zinc-500 mb-10">Effective July 22, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-zinc-300">
          <section>
            <p>
              This Privacy Policy explains what information Bario (operated by A Unique Group Inc.,
              "Bario", "we", "us") collects, how we use it, and your rights, in line with Canada's Personal
              Information Protection and Electronic Documents Act (PIPEDA).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">1. Information we collect</h2>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Account info:</strong> the email address and password (stored as a salted hash, never in plain text) you sign up with.</li>
              <li><strong>Site content:</strong> whatever you build — text, theme colors, uploaded images/favicons, and the domain(s) you connect.</li>
              <li><strong>Billing info:</strong> handled directly by Stripe. We store your subscription status and Stripe customer/subscription IDs, not your card number.</li>
              <li><strong>Usage data:</strong> basic technical data like IP address and request metadata, used for rate-limiting/abuse prevention and error diagnostics.</li>
              <li><strong>Analytics (optional):</strong> if you add a Google Analytics ID to your published site, GA4 collects visitor data on your site per Google's terms — that's between you and your visitors, and we don't access it.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">2. How we use your information</h2>
            <ul className="list-disc list-inside space-y-1">
              <li>To operate your account and serve your published site(s)</li>
              <li>To process payments and manage subscriptions</li>
              <li>To send transactional email (password resets, email verification, billing notices) — never marketing email without your consent</li>
              <li>To detect and prevent abuse (e.g. rate limiting login/signup)</li>
              <li>To diagnose and fix errors</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">3. Third parties we share data with</h2>
            <p>We use the following providers to operate Bario, each of which processes a limited slice of your data on our behalf:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li><strong>Vercel</strong> — hosting, custom domain connection, favicon file storage</li>
              <li><strong>Neon</strong> — our Postgres database (account and site data)</li>
              <li><strong>OpenAI</strong> — processes your builder prompts and current site content to generate/edit sites</li>
              <li><strong>Stripe</strong> — payment processing and subscription billing</li>
              <li><strong>Resend</strong> — sends transactional email on our behalf</li>
              <li><strong>Sentry</strong> — error monitoring (may capture technical error details, not your site content)</li>
            </ul>
            <p className="mt-2">
              We don't sell your personal information, and we don't share it with anyone else except as
              needed to run the service or where required by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">4. Cookies</h2>
            <p>
              We use a single essential cookie to keep you signed in (a session token). We don't use
              third-party advertising or tracking cookies on bario.ca itself.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">5. Data retention</h2>
            <p>
              We keep your account and site data for as long as your account is active. If you delete your
              account, we delete your site content and personal information within a reasonable period,
              except where we're required to retain billing records for legal/tax purposes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">6. Your rights</h2>
            <p>
              You can access, correct, or request deletion of your personal information at any time by
              emailing hello@bario.ca. You can also change your password or resend a verification email
              directly from your dashboard.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">7. Children's privacy</h2>
            <p>Bario is not directed at children under 13, and we don't knowingly collect data from them.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">8. Changes to this policy</h2>
            <p>
              We may update this policy from time to time. We'll post the updated version here with a new
              effective date.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">9. Contact</h2>
            <p>Questions about this policy or your data? Email us at hello@bario.ca.</p>
          </section>
        </div>
      </div>
    </main>
  )
}
