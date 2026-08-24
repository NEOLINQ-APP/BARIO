import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service — Bario',
}

export default function Terms() {
  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <a href="/" className="text-sm text-amber-600 dark:text-[#f59e0b]">← Back to bario.ca</a>
        <h1 className="text-3xl font-bold mt-6 mb-2">Terms of Service</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-500 mb-10">Effective August 24, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-slate-700 dark:text-zinc-300">
          <section>
            <p>
              These Terms of Service ("Terms") govern your use of Bario (bario.ca), a website-building
              service operated by A Unique Group Inc. ("Bario", "we", "us", "our"), based in Edmonton,
              Alberta and Vancouver, British Columbia, Canada. By creating an account or using Bario, you
              agree to these Terms. If you don't agree, don't use the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100 mb-2">1. What Bario is</h2>
            <p>
              Bario lets you describe a business or idea and generates a website you can edit, publish to
              a bario.ca subdomain or your own custom domain, and manage from your dashboard. Some content
              (such as images) may be AI-generated or placeholder content styled to match your site — we
              tell you plainly in the builder when that's the case.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100 mb-2">2. Hosting scope and limitations</h2>
            <p>
              Bario's free and badged hosting plans serve static, template-based websites — pages built with
              our AI builder or imported as HTML/CSS/JavaScript that runs in the visitor's browser. They do
              not include a server, database, or backend of your own. If your site depends on
              server-side infrastructure — for example, a full e-commerce checkout, user accounts with a
              real database, custom APIs, or anything that needs to run code on our servers rather than the
              visitor's browser — those features will not function on standard hosting and require our
              separate VPS product (a real virtual server, billed separately — see{' '}
              <a href="/vps" className="text-amber-600 dark:text-[#f59e0b] underline">bario.ca/vps</a>). Signing
              up for free or badged hosting does not entitle you to backend functionality of any kind; we're
              not responsible for a site or feature that doesn't work because it needed a VPS you didn't add.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100 mb-2">3. Your account</h2>
            <p>
              You must provide a valid email address and keep your login credentials secure. You're
              responsible for activity that happens under your account. Tell us right away if you suspect
              unauthorized access. We may require email verification before certain features (like the AI
              builder) are unlocked, to keep the service usable for everyone.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100 mb-2">4. Subscriptions and billing</h2>
            <p>
              Paid plans are billed on a recurring basis through Stripe, our payment processor — we never
              see or store your full card number. Subscriptions renew automatically until canceled. You can
              cancel any time from your dashboard or by contacting us; cancellation takes effect at the end
              of the current billing period. If a payment fails, your plan may be marked past due and your
              published site(s) may be automatically unpublished until payment succeeds. Fees are
              non-refundable except where required by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100 mb-2">5. Acceptable use</h2>
            <p>You agree not to use Bario to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Publish illegal content, or content that infringes someone else's rights</li>
              <li>Distribute malware, phishing pages, or scam/fraudulent sites</li>
              <li>Harass, defame, or threaten any person or group</li>
              <li>Abuse, probe, or attempt to circumvent rate limits, credits, or access controls</li>
              <li>Resell or sublicense access to the service without our written permission</li>
            </ul>
            <p className="mt-2">
              We may suspend or terminate accounts that violate this section, with or without notice,
              depending on severity.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100 mb-2">6. Your content</h2>
            <p>
              You own the content you create with Bario — your site's text, images you upload, and your
              business information. You grant us a license to host, store, and display that content solely
              to operate the service (e.g. serving your published site to visitors). You're responsible for
              making sure you have the rights to any content you upload or generate.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100 mb-2">7. Third-party services</h2>
            <p>
              Bario relies on third-party providers to operate: Vercel (hosting, domains, file storage),
              Neon (database), OpenAI (AI generation), Stripe (billing), Resend (transactional email), and
              Sentry (error monitoring). Your use of Bario is also subject to how these providers handle
              data on our behalf, as described in our <a href="/privacy" className="text-amber-600 dark:text-[#f59e0b] underline">Privacy Policy</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100 mb-2">8. Disclaimers and limitation of liability</h2>
            <p>
              Bario is provided "as is" without warranties of any kind, express or implied. We don't
              guarantee the service will be uninterrupted, error-free, or that AI-generated content will be
              accurate. To the maximum extent permitted by law, A Unique Group Inc. is not liable for
              indirect, incidental, or consequential damages arising from your use of the service. Our
              total liability for any claim is limited to the amount you paid us in the 3 months before the
              claim arose.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100 mb-2">9. Termination</h2>
            <p>
              You can stop using Bario and delete your account at any time by contacting us. We may
              suspend or terminate your access for violating these Terms. On termination, we may delete
              your site content after a reasonable grace period.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100 mb-2">10. Changes to these Terms</h2>
            <p>
              We may update these Terms from time to time. We'll post the updated version here with a new
              effective date. Continued use of Bario after a change means you accept the update.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100 mb-2">11. Governing law</h2>
            <p>
              These Terms are governed by the laws of the Province of Alberta, Canada, without regard to
              conflict-of-law principles.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-zinc-100 mb-2">12. Contact</h2>
            <p>Questions about these Terms? Email us at hello@bario.ca.</p>
          </section>
        </div>
      </div>
    </main>
  )
}
