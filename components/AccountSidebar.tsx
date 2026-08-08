'use client'

import { usePathname } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'
import ThemeToggle from '@/components/ThemeToggle'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home', icon: '🏠' },
  { href: '/dashboard/websites', label: 'Websites', icon: '🌐' },
  { href: '/dashboard/domains', label: 'Domains', icon: '🔎' },
  { href: '/dashboard/crm', label: 'CRM', icon: '🧑‍💼' },
  { href: '/dashboard/bario-one', label: 'Bario One™', icon: '🏛️' },
  { href: '/dashboard/social', label: 'Social', icon: '📣' },
  { href: '/dashboard/flo-api', label: 'Flo API', icon: '🔌' },
  { href: '/dashboard/voice-agent', label: 'Voice Agent', icon: '📞' },
  { href: '/dashboard/email', label: 'Email', icon: '📧' },
  { href: '/media', label: 'X-Drive', icon: '📁' },
  { href: '/dashboard/studio', label: 'Studio', icon: '🎬' },
  { href: '/build/apps', label: 'Build (beta)', icon: '⚡' },
  { href: '/dashboard/servers', label: 'Servers', icon: '🖥️' },
  { href: '/dashboard/wp-hosting', label: 'WordPress Hosting', icon: '📝' },
  { href: '/dashboard/billing', label: 'Billing', icon: '💳' },
  { href: '/dashboard/account', label: 'Account', icon: '⚙️' },
]

export default function AccountSidebar({ email, isAdmin, clientCompanyLabel }: { email: string; isAdmin: boolean; clientCompanyLabel?: string | null }) {
  const pathname = usePathname()
  const navItems = clientCompanyLabel
    ? [...NAV_ITEMS.slice(0, 1), { href: '/dashboard/requests', label: 'Requests', icon: '📋' }, ...NAV_ITEMS.slice(1)]
    : NAV_ITEMS

  return (
    <aside className="w-full md:w-60 md:min-h-screen md:border-r border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0b111c] px-4 py-6 flex md:flex-col gap-1 md:sticky md:top-0">
      <div className="flex items-center justify-between px-2 mb-4">
        <a href="/" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bario-icon-64.png" alt="Bario" className="h-7 w-7" />
          <span className="font-extrabold text-slate-900 dark:text-white tracking-tight">bario<span className="text-cyan-600 dark:text-cyan-400">.ca</span></span>
        </a>
        <ThemeToggle className="md:hidden" />
      </div>

      <nav className="flex md:flex-col gap-1 flex-1 overflow-x-auto md:overflow-visible">
        {navItems.map((item) => {
          const active = item.href === '/dashboard' ? pathname === '/dashboard' : pathname?.startsWith(item.href)
          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-900'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </a>
          )
        })}
        {isAdmin && (
          <a
            href="/admin"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              pathname?.startsWith('/admin')
                ? 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white'
                : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-900'
            }`}
          >
            <span>🛡️</span>
            Admin panel
          </a>
        )}
      </nav>

      <div className="hidden md:block mt-4 pt-4 border-t border-slate-200 dark:border-zinc-800 space-y-3">
        <ThemeToggle />
        <div className="text-xs text-slate-500 dark:text-zinc-500 truncate px-2">{email}</div>
        <div className="px-2">
          <LogoutButton />
        </div>
      </div>
    </aside>
  )
}
