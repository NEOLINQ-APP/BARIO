'use client'

import { usePathname } from 'next/navigation'
import LogoutButton from '@/components/LogoutButton'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home', icon: '🏠' },
  { href: '/dashboard/websites', label: 'Websites', icon: '🌐' },
  { href: '/media', label: 'X-Drive', icon: '📁' },
  { href: '/dashboard/billing', label: 'Billing', icon: '💳' },
  { href: '/dashboard/account', label: 'Account', icon: '⚙️' },
]

export default function AccountSidebar({ email, isAdmin }: { email: string; isAdmin: boolean }) {
  const pathname = usePathname()

  return (
    <aside className="w-full md:w-60 md:min-h-screen md:border-r border-zinc-800 bg-[#0b111c] px-4 py-6 flex md:flex-col gap-1 md:sticky md:top-0">
      <a href="/" className="flex items-center gap-2 px-2 mb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/bario-icon-64.png" alt="Bario" className="h-7 w-7" />
        <span className="font-extrabold text-white tracking-tight">bario<span className="text-cyan-400">.ca</span></span>
      </a>

      <nav className="flex md:flex-col gap-1 flex-1 overflow-x-auto md:overflow-visible">
        {NAV_ITEMS.map((item) => {
          const active = item.href === '/dashboard' ? pathname === '/dashboard' : pathname?.startsWith(item.href)
          return (
            <a
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                active ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
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
              pathname?.startsWith('/admin') ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            <span>🛡️</span>
            Admin panel
          </a>
        )}
      </nav>

      <div className="hidden md:block mt-4 pt-4 border-t border-zinc-800">
        <div className="text-xs text-zinc-500 truncate px-2 mb-2">{email}</div>
        <div className="px-2">
          <LogoutButton />
        </div>
      </div>
    </aside>
  )
}
