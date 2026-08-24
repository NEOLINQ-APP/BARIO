'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'
import ThemeToggle from '@/components/ThemeToggle'
import { getAccountNavItems, withClientRequestsLink } from '@/lib/accountNav'
import { hasZeusStudioAccess } from '@/lib/access'

export default function AccountSidebar({ email, isAdmin, clientCompanyLabel }: { email: string; isAdmin: boolean; clientCompanyLabel?: string | null }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const canBuildStudio = hasZeusStudioAccess({ is_admin: isAdmin, email })
  const navItems = withClientRequestsLink(getAccountNavItems({ canBuildStudio }), clientCompanyLabel ?? null)

  function navLink(item: { href: string; label: string; icon: string }, onNavigate?: () => void) {
    const active = item.href === '/dashboard' ? pathname === '/dashboard' : pathname?.startsWith(item.href)
    return (
      <a
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
          active
            ? 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white'
            : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-900'
        }`}
      >
        <span>{item.icon}</span>
        {item.label}
      </a>
    )
  }

  function adminLink(onNavigate?: () => void) {
    if (!isAdmin) return null
    return (
      <a
        href="/admin"
        onClick={onNavigate}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
          pathname?.startsWith('/admin')
            ? 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white'
            : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-900'
        }`}
      >
        <span>🛡️</span>
        Admin panel
      </a>
    )
  }

  const logo = (
    <a href="/" className="flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/bario-icon-64.png" alt="Bario" className="h-7 w-7" />
      <span className="font-extrabold text-slate-900 dark:text-white tracking-tight">bario<span className="text-cyan-600 dark:text-cyan-400">.ca</span></span>
    </a>
  )

  return (
    <>
      {/* Mobile top bar — logo + hamburger, always visible below md */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0b111c] sticky top-0 z-30">
        {logo}
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="flex items-center gap-2 h-10 px-4 rounded-lg border-2 border-cyan-600 dark:border-cyan-400 text-cyan-700 dark:text-cyan-300 font-bold text-sm bg-cyan-50 dark:bg-cyan-950/40"
          >
            <span className="text-lg leading-none">☰</span>
            MENU
          </button>
        </div>
      </div>

      {/* Mobile slide-out drawer with the full nav list */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="w-72 max-w-[82vw] h-full bg-white dark:bg-[#0b111c] border-r border-slate-200 dark:border-zinc-800 px-4 py-5 flex flex-col overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              {logo}
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-center h-9 w-9 rounded-lg border border-slate-300 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 text-lg"
              >
                ✕
              </button>
            </div>
            <nav className="flex flex-col gap-1 flex-1">
              {navItems.map((item) => navLink(item, () => setMobileOpen(false)))}
              {adminLink(() => setMobileOpen(false))}
            </nav>
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-zinc-800 space-y-3">
              <div className="text-xs text-slate-500 dark:text-zinc-500 truncate px-2">{email}</div>
              <div className="px-2">
                <LogoutButton />
              </div>
            </div>
          </div>
          {/* Tap outside the drawer to close it */}
          <div className="flex-1 bg-black/40" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Desktop persistent sidebar — unchanged from before, just gated to md+ */}
      <aside className="hidden md:flex md:w-60 md:min-h-screen md:border-r border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0b111c] px-4 py-6 md:flex-col gap-1 md:sticky md:top-0">
        <div className="flex items-center justify-between px-2 mb-4">
          {logo}
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => navLink(item))}
          {adminLink()}
        </nav>

        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-zinc-800 space-y-3">
          <ThemeToggle />
          <div className="text-xs text-slate-500 dark:text-zinc-500 truncate px-2">{email}</div>
          <div className="px-2">
            <LogoutButton />
          </div>
        </div>
      </aside>
    </>
  )
}
