// Business OS Step 4 — the one shared shell for every not-yet-built nav
// leaf. Never a copy-pasted fake page, never a dead button: this is
// honest about what phase the real thing lands in, with nothing on the
// page that pretends to work.
export default function BarioOneComingSoon({ title, phase, description }: { title: string; phase: string; description: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#131b2a] p-8 text-center max-w-lg mx-auto">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-[#d4af37] mb-2">Coming in {phase}</p>
      <h2 className="text-lg font-bold mb-2">{title}</h2>
      <p className="text-sm text-slate-500 dark:text-zinc-400">{description}</p>
    </div>
  )
}
