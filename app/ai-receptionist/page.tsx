// app/ai-receptionist/page.tsx
// Public marketing/demo page for the B2B AI Receptionist product — real,
// already-shipped infrastructure (voice_agent_configs, Stripe checkout at
// /voice-agent/checkout) that had zero public discoverability before this
// (only a logged-in dashboard page existed). Same pattern as /victoria
// (the personal-assistant equivalent), different persona/branding so the
// two products don't blur together.

import SiteNav from '@/components/SiteNav'
import SiteFooter from '@/components/SiteFooter'
import VictoriaIntroPlayer from '@/components/VictoriaIntroPlayer'
import VictoriaDemoRequestForm from '@/components/VictoriaDemoRequestForm'

export const metadata = {
  title: 'AI Receptionist — Never Miss a Call Again',
  description: 'A real AI receptionist that answers every call for your business, knows your hours and pricing, takes messages, and logs every conversation — available day or night.',
}

const AVATAR_URL = 'https://storage.bario.ca/bario-storage/victoria-family-generated/avatar-1787162101067-auduy060.png'
const AUDIO_URL = 'https://storage.bario.ca/bario-storage/victoria-family-generated/receptionist-intro-nebodumc.mp3'

const CAPABILITIES = [
  { title: 'Answers every call', body: 'No more missed calls or busy signals — she picks up every time, day or night.' },
  { title: 'Knows your business', body: 'Hours, pricing, services, FAQs — she answers accurately because she actually knows your business.' },
  { title: 'Takes messages & orders', body: 'Nothing falls through the cracks. Every message and order gets captured and sent straight to you.' },
  { title: 'Transfers real calls', body: 'When a caller needs a real person, she connects them right away instead of leaving them stuck.' },
]

export default function AiReceptionistLandingPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-slate-100 font-sans antialiased">
      <SiteNav active="ai-receptionist" />

      {/* HERO */}
      <section className="relative overflow-hidden py-20 px-6 sm:px-12 border-b border-slate-200 dark:border-slate-800/80">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-amber-500/10 blur-[130px] rounded-full pointer-events-none" />
        <div className="max-w-3xl mx-auto text-center space-y-8 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm font-medium">
            <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-ping" />
            AI Receptionist — for your business phone line
          </div>

          <VictoriaIntroPlayer avatarUrl={AVATAR_URL} audioUrl={AUDIO_URL} name="your AI receptionist" />

          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
              Never miss a call,
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">or a customer</span>
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
              A real AI receptionist for your business — she knows your hours, your pricing, your services, and answers every call like she works there. Because she does.
            </p>
          </div>

          <a
            href="#try-it"
            className="inline-flex px-6 py-3 rounded-xl font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors"
          >
            Try it for your business
          </a>
        </div>
      </section>

      {/* CAPABILITIES */}
      <section className="py-20 px-6 sm:px-12 max-w-5xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
          <h2 className="text-3xl font-extrabold sm:text-4xl">What she does for your business</h2>
          <p className="text-slate-600 dark:text-slate-400">Live, real capabilities — not a proof of concept.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {CAPABILITIES.map((c) => (
            <div
              key={c.title}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-2"
            >
              <h3 className="font-bold text-slate-900 dark:text-white">{c.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* TRY IT */}
      <section id="try-it" className="py-20 px-6 sm:px-12 max-w-3xl mx-auto text-center space-y-10">
        <div className="space-y-3">
          <h2 className="text-3xl font-extrabold sm:text-4xl">See it answer for your business</h2>
          <p className="text-slate-600 dark:text-slate-400">
            Tell us about your business and we'll set up a real live demo call, using your own hours and pricing.
          </p>
        </div>
        <VictoriaDemoRequestForm product="business" assistantName="your AI receptionist" />
      </section>

      <SiteFooter />
    </main>
  )
}
