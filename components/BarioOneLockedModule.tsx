import { BO_MODULES, type BoModuleKey } from '@/lib/barioOneModules'

// Same locked-card shell as MigrateSitePanel.tsx's "Upgrade to unlock"
// pattern used elsewhere in the app — a plain server component (no
// interactivity needed, just a link) so every module page can render it
// identically without shipping client JS for something this simple.
export default function BarioOneLockedModule({ moduleKey }: { moduleKey: BoModuleKey }) {
  const module = BO_MODULES[moduleKey]
  return (
    <div className="rounded-2xl border border-slate-300 dark:border-zinc-800 bg-white dark:bg-[#131b2a] shadow-sm dark:shadow-none p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold">{module.name} isn&apos;t enabled for your business yet</h2>
          <p className="text-xs text-slate-500 dark:text-zinc-500 mt-1 max-w-md">{module.description}</p>
        </div>
        <a
          href="/dashboard/bario-one/modules"
          className="px-4 py-2 rounded-lg bg-amber-500 dark:bg-[#d4af37] text-white dark:text-black text-xs font-semibold whitespace-nowrap"
        >
          Enable {module.name} — ${(module.priceCentsCad / 100).toFixed(0)}/mo
        </a>
      </div>
    </div>
  )
}
