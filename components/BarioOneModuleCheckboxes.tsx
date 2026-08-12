'use client'

import { BO_MODULE_KEYS, BO_MODULES, resolveModuleDependencies, type BoModuleKey } from '@/lib/barioOneModules'

// Shared module-selection UI used both on the public signup form
// (components/BarioOneSignupForm.tsx) and the logged-in "set up your
// workspace" card (BarioOneDashboard.tsx's OnboardingCard) — one
// definition of "pick your modules" rather than two independently
// maintained pickers.
export default function BarioOneModuleCheckboxes({
  selected,
  onChange,
  dark = true,
}: {
  selected: BoModuleKey[]
  onChange: (keys: BoModuleKey[]) => void
  dark?: boolean
}) {
  const resolved = resolveModuleDependencies(selected)
  const totalCents = resolved.reduce((sum, k) => sum + BO_MODULES[k].priceCentsCad, 0)

  function toggle(key: BoModuleKey) {
    const isOn = resolveModuleDependencies(selected).includes(key)
    if (isOn) {
      const withoutIt = selected.filter((k) => k !== key)
      onChange(withoutIt.filter((k) => !BO_MODULES[k].requires.includes(key)))
    } else {
      onChange([...selected, key])
    }
  }

  const border = dark ? 'border-zinc-700' : 'border-slate-300 dark:border-zinc-700'
  const borderOn = dark ? 'border-[#d4af37] bg-[#d4af37]/5' : 'border-amber-500 dark:border-[#d4af37] bg-amber-500/5 dark:bg-[#d4af37]/5'
  const label = dark ? 'text-zinc-400' : 'text-slate-500 dark:text-zinc-400'
  const title = dark ? 'text-white' : 'text-slate-900 dark:text-white'

  return (
    <div className="space-y-2">
      <label className={`text-xs font-medium block mb-1 ${label}`}>Choose your modules</label>
      <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
        {BO_MODULE_KEYS.map((key) => {
          const module = BO_MODULES[key]
          const isOn = resolved.includes(key)
          const isAutoIncluded = isOn && !selected.includes(key)
          return (
            <label
              key={key}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 cursor-pointer text-sm ${isOn ? borderOn : border}`}
            >
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={isOn} disabled={isAutoIncluded} onChange={() => toggle(key)} className="h-4 w-4" />
                <p className={`font-medium ${title}`}>
                  {module.name}
                  {isAutoIncluded && <span className={`ml-2 text-[10px] ${label}`}>required</span>}
                </p>
              </div>
              <span className={`whitespace-nowrap ${label}`}>${(module.priceCentsCad / 100).toFixed(0)}/mo</span>
            </label>
          )
        })}
      </div>
      <div className={`flex items-center justify-between pt-1 text-sm border-t ${border}`}>
        <span className={label}>Total</span>
        <span className={`font-bold ${title}`}>${(totalCents / 100).toFixed(0)}/mo CAD</span>
      </div>
    </div>
  )
}
