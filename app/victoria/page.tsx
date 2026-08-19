// app/victoria/page.tsx
// Public "meet Victoria" page — introduces the personal-assistant/
// companion product to prospects who aren't Bario customers yet. No live
// public call line yet (see components/VictoriaDemoRequestForm.tsx's
// comment for why); this is the first real public-facing surface for the
// product, matching the "Julie AI"-style demo experience the team wanted.

import SiteNav from '@/components/SiteNav'
import SiteFooter from '@/components/SiteFooter'
import VictoriaIntroPlayer from '@/components/VictoriaIntroPlayer'
import VictoriaDemoRequestForm from '@/components/VictoriaDemoRequestForm'

export const metadata = {
  title: 'Meet Victoria — Your Personal AI Assistant',
  description: 'Victoria remembers your contacts, manages your calendar, sends reminders, and is available to talk anytime, day or night — a real personal AI assistant, not a chatbot.',
}

const CAPABILITIES = [
  { title: 'Always available', body: 'Call or open the app anytime — day or night, wherever you are.' },
  { title: 'Remembers what matters', body: 'Your contacts, notes, and calendar — all in one place, always ready.' },
  { title: 'Takes real action', body: 'Reach someone, send a text, set a reminder — she just does it, no hesitation.' },
  { title: 'Actually talks with you', body: 'Natural conversation, not a script — ask her anything, anytime.' },
]

export default function VictoriaLandingPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-slate-100 font-sans antialiased">
      <SiteNav active="victoria" />

      {/* HERO */}
      <section className="relative overflow-hidden py-20 px-6 sm:px-12 border-b border-slate-200 dark:border-slate-800/80">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-amber-500/10 blur-[130px] rounded-full pointer-events-none" />
        <div className="max-w-3xl mx-auto text-center space-y-8 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-sm font-medium">
            <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-ping" />
            Meet Victoria — a real personal AI assistant
          </div>

          <VictoriaIntroPlayer />

          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
              Your own AI assistant,
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">available anytime</span>
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-xl mx-auto">
              Not a chatbot — a real assistant you can call and talk to. Victoria remembers your contacts, manages your calendar, sends reminders, and gets things done, day or night.
            </p>
          </div>

          <a
            href="#try-it"
            className="inline-flex px-6 py-3 rounded-xl font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors"
          >
            Try Victoria
          </a>
        </div>
      </section>

      {/* CAPABILITIES */}
      <section className="py-20 px-6 sm:px-12 max-w-5xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14 space-y-3">
          <h2 className="text-3xl font-extrabold sm:text-4xl">What she actually does</h2>
          <p className="text-slate-600 dark:text-slate-400">Real capabilities, available the first time you talk to her.</p>
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
          <h2 className="text-3xl font-extrabold sm:text-4xl">Ready to try her yourself?</h2>
          <p className="text-slate-600 dark:text-slate-400">
            Leave your number and we'll set up a real live conversation with Victoria, one on one.
          </p>
        </div>
        <VictoriaDemoRequestForm />
      </section>

      <SiteFooter />
    </main>
  )
}
