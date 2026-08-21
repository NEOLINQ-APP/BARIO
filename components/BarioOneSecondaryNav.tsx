'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { BARIO_ONE_NAV_ITEMS } from '@/lib/barioOneNav'

// Business OS Phase 1 — persistent secondary nav scoped to
// /dashboard/bario-one/* only (mounted from that route segment's own
// layout.tsx). Same org/enabledModules fetch BarioOneDashboard.tsx
// already uses, same grey-out-and-redirect-to-modules pattern its old
// tile grid used, just as a nav list instead of a grid.
export default function BarioOneSecondaryNav() {
  const pathname = usePathname()
  const [enabledModules, setEnabledModules] = useState<string[] | null>(null)

  useEffect(() => {
    fetch('/api/bario-one/organization')
      .then((r) => r.json())
      .then((data) => setEnabledModules(data.org?.enabledModules ?? []))
      .catch(() => setEnabledModules([]))
  }, [])

  return (
    <nav className="w-full md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-slate-200 dark:border-zinc-800 px-3 py-4 md:py-6">
      <ul className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
        {BARIO_ONE_NAV_ITEMS.map((item) => {
          const active = item.href === '/dashboard/bario-one' ? pathname === item.href : pathname?.startsWith(item.href)
          const locked = !item.comingSoon && item.moduleKey !== null && enabledModules !== null && !enabledModules.includes(item.moduleKey)
          const href = locked ? '/dashboard/bario-one/modules' : item.href

          return (
            <li key={item.href} className="shrink-0">
              <a
                href={href}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                  active
                    ? 'bg-amber-500/10 text-amber-700 dark:text-[#d4af37]'
                    : locked
                      ? 'text-slate-400 dark:text-zinc-600'
                      : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
                {item.comingSoon && (
                  <span className="ml-auto text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
                    Soon
                  </span>
                )}
                {locked && !item.comingSoon && <span className="ml-auto text-xs">🔒</span>}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
