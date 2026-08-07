import ThemeToggle from '@/components/ThemeToggle'

const LINKS = [
  { href: '/hosting', label: 'Hosting', key: 'hosting' },
  { href: '/storage', label: 'X-Drive', key: 'storage' },
  { href: '/vps', label: 'VPS Servers', key: 'vps' },
  { href: '/bario-one', label: 'Bario One', key: 'bario-one' },
  { href: '/site-audit', label: 'Free Site Audit', key: 'audit' },
]

export default function SiteNav({ active }: { active?: string }) {
  return (
    <nav className="border-b border-slate-200 dark:border-slate-800/80 px-6 sm:px-12 py-4 flex items-center justify-between max-w-7xl mx-auto">
      <a href="/" className="flex items-center gap-2 font-extrabold text-xl tracking-tight text-slate-900 dark:text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/bario-icon-64.png" alt="Bario" className="h-8 w-8" />
        <span className="text-cyan-600 dark:text-cyan-400">bario</span>
        <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
          .ca
        </span>
      </a>
      <div className="flex items-center gap-5 sm:gap-6 text-sm font-medium">
        {LINKS.map((link) => (
          <a
            key={link.key}
            href={link.href}
            className={
              active === link.key
                ? 'hidden sm:inline text-slate-900 dark:text-white'
                : 'hidden sm:inline text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors'
            }
          >
            {link.label}
          </a>
        ))}
        <ThemeToggle />
        <a
          href="/login"
          className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
        >
          Client Portal
        </a>
      </div>
    </nav>
  )
}
