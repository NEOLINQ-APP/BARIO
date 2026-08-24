'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'
import { getAccountNavItems, APP_FALLBACK_NAV_PREFIXES, withClientRequestsLink } from '@/lib/accountNav'
import { hasZeusStudioAccess } from '@/lib/access'

type MeResponse =
  | { loggedIn: false }
  | { loggedIn: true; email: string; isAdmin: boolean; clientCompanyLabel: string | null }

// Fallback nav for logged-in users on in-app pages that don't have their
// own way back to the dashboard yet (currently: /admin, /build/templates —
// see APP_FALLBACK_NAV_PREFIXES). Deliberately an allowlist, not "show
// everywhere except X" — that inverted version used to appear on the public
// marketing pages, and even on `/site/[domain]/...` (every customer's own
// hosted website, since a `*.bario.ca` subdomain shares the session cookie)
// whenever the viewer happened to be logged in. This button is only for
// navigating *our* app, so it only ever renders on pages explicitly opted
// in. Placed top-right (not a floating bottom-left pill) so it never
// overlaps a page's own bottom-anchored controls like a chat input.
export default function GlobalMenuButton() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [me, setMe] = useState<MeResponse | null>(null)

  const eligiblePage = APP_FALLBACK_NAV_PREFIXES.some((p) => pathname?.startsWith(p))

  useEffect(() => {
    if (!eligiblePage) return
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data: MeResponse) => setMe(data))
      .catch(() => setMe({ loggedIn: false }))
  }, [eligiblePage])

  if (!eligiblePage || !me?.loggedIn) return null

  const canBuildStudio = hasZeusStudioAccess({ is_admin: me.isAdmin, email: me.email })
  const navItems = withClientRequestsLink(getAccountNavItems({ canBuildStudio }), me.clientCompanyLabel)

  return (
    <>
      <button
        type="button"
        aria-label="Open Bario menu"
        onClick={() => setOpen(true)}
        className="fixed top-4 right-4 z-[70] flex items-center gap-2 h-10 px-3.5 rounded-full border-2 border-cyan-600 dark:border-cyan-400 text-cyan-700 dark:text-cyan-300 font-bold text-sm bg-white dark:bg-[#0b111c] shadow-lg"
      >
        <span className="text-lg leading-none">☰</span>
        Menu
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex justify-end">
          <div className="flex-1 bg-black/40" onClick={() => setOpen(false)} />
          <div className="w-72 max-w-[82vw] h-full bg-white dark:bg-[#0b111c] border-l border-slate-200 dark:border-zinc-800 px-4 py-5 flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <a href="/" className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/bario-icon-64.png" alt="Bario" className="h-7 w-7" />
                <span className="font-extrabold text-slate-900 dark:text-white tracking-tight">
                  bario<span className="text-cyan-600 dark:text-cyan-400">.ca</span>
                </span>
              </a>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center h-9 w-9 rounded-lg border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 text-lg"
              >
                ✕
              </button>
            </div>
            <nav className="flex flex-col gap-1 flex-1">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-900"
                >
                  <span>{item.icon}</span>
                  {item.label}
                </a>
              ))}
              {me.isAdmin && (
                <a
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-900"
                >
                  <span>🛡️</span>
                  Admin panel
                </a>
              )}
            </nav>
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-zinc-800 space-y-3">
              <div className="text-xs text-slate-500 dark:text-zinc-500 truncate px-2">{me.email}</div>
              <div className="px-2">
                <LogoutButton />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
