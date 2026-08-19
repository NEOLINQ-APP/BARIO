import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Careers — Bario',
}

export default function Careers() {
  return (
    <main className="min-h-screen bg-white dark:bg-[#0b111c] text-slate-900 dark:text-zinc-100 antialiased px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <a href="/" className="text-sm text-amber-600 dark:text-[#f59e0b]">← Back to bario.ca</a>
        <h1 className="text-3xl font-bold mt-6 mb-2">Join Our Team</h1>
        <p className="text-sm text-slate-500 dark:text-zinc-500 mb-10">Careers at Bario</p>

        <div className="space-y-6 text-sm leading-relaxed text-slate-700 dark:text-zinc-300">
          <p>
            Bario is a small, fast-moving team building hosting, AI website tools, and business software for
            Canadian businesses. We don't always have open roles, but we're always glad to hear from people
            who'd be a great fit for where we're headed.
          </p>
          <p>
            Send your resume and a short note about what you'd want to work on to{' '}
            <a href="mailto:admin@bario.ca?subject=Job%20Application" className="underline text-amber-600 dark:text-[#f59e0b]">
              admin@bario.ca
            </a>
            . We review every application — if there's a fit with something we're hiring for now or soon, we'll
            reach out.
          </p>
        </div>
      </div>
    </main>
  )
}
