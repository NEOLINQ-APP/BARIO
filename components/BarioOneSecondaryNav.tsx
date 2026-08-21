'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { BARIO_ONE_NAV } from '@/lib/barioOneNav'

// Business OS Steps 3-15 -- 2-level nav (12 sections, ~56 leaves).
// Sections render as an accordion, auto-expanded for whichever section
// the current route falls under; same org/enabledModules fetch and
// grey-out-and-redirect-to-modules pattern the flat Phase 1 nav already
// used. Mobile: sections scroll horizontally, tap to expand -- same
// responsive shape already used elsewhere in this app, no new UI
// dependency.
export default function BarioOneSecondaryNav() {
  const pathname = usePathname()
  const [enabledModules, setEnabledModules] = useState<string[] | null>(null)
  const [openSection, setOpenSection] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/bario-one/organization')
      .then((r) => r.json())
      .then((data) => setEnabledModules(data.org?.enabledModules ?? []))
      .catch(() => setEnabledModules([]))
  }, [])

  useEffect(() => {
    const active = BARIO_ONE_NAV.find((s) => s.href === pathname || s.items.some((i) => pathname?.startsWith(i.href.split('?')[0])))
    if (active) setOpenSection(active.key)
  }, [pathname])

  return (
    <nav className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-slate-200 dark:border-zinc-800 px-3 py-4 md:py-6">
      <ul className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
        {BARIO_ONE_NAV.map((section) => {
          const sectionActive = pathname === section.href || section.items.some((i) => pathname?.startsWith(i.href.split('?')[0]))
          const expanded = openSection === section.key
          return (
            <li key={section.key} className="shrink-0 md:w-full">
              <button
                type="button"
                onClick={() => {
                  setOpenSection(expanded ? null : section.key)
                  if (section.items.length === 0) window.location.href = section.href
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                  sectionActive
                    ? 'bg-amber-500/10 text-amber-700 dark:text-[#d4af37]'
                    : 'text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800'
                }`}
              >
                <span>{section.icon}</span>
                <span>{section.label}</span>
                {section.items.length > 0 && <span className="ml-auto text-xs opacity-60">{expanded ? '-' : '>'}</span>}
              </button>
              {section.items.length > 0 && expanded && (
                <ul className="mt-1 ml-4 pl-3 border-l border-slate-200 dark:border-zinc-800 space-y-0.5">
                  {section.items.map((item) => {
                    const basePath = item.href.split('?')[0]
                    const active = pathname === basePath
                    const locked = item.moduleKey !== null && enabledModules !== null && !enabledModules.includes(item.moduleKey)
                    const href = locked ? '/dashboard/bario-one/modules' : item.href
                    return (
                      <li key={item.href}>
                        <a
                          href={href}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs whitespace-nowrap ${
                            active
                              ? 'text-amber-700 dark:text-[#d4af37] font-medium'
                              : locked
                                ? 'text-slate-400 dark:text-zinc-600'
                                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100'
                          }`}
                        >
                          <span>{item.label}</span>
                          {item.status === 'comingSoon' && (
                            <span className="text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded bg-slate-200 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400">
                              Soon
                            </span>
                          )}
                          {locked && <span className="ml-auto text-[10px]">Locked</span>}
                        </a>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
