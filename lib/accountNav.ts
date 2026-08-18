export type NavItem = { href: string; label: string; icon: string }

// Shared with GlobalMenuButton (the fallback nav available on pages outside
// the (account) dashboard chrome, e.g. /build, /admin, marketing pages) so
// both stay in sync automatically — add a new dashboard section here once,
// not in two places.
export const ACCOUNT_NAV_ITEMS: NavItem[] = [
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
  { href: 'https://build.bario.ca', label: 'Build (beta)', icon: '⚡' },
  { href: '/dashboard/servers', label: 'Servers', icon: '🖥️' },
  { href: '/dashboard/wp-hosting', label: 'WordPress Hosting', icon: '📝' },
  { href: '/dashboard/billing', label: 'Billing', icon: '💳' },
  { href: '/dashboard/account', label: 'Account', icon: '⚙️' },
]

// Pages that already render AccountSidebar (which has its own MENU button
// and drawer) — GlobalMenuButton skips these to avoid showing two menu
// triggers on the same page. Keep in sync with app/(account)'s route group.
export const ACCOUNT_CHROME_PREFIXES = ['/dashboard', '/media', '/victoria-app']

// Exact-path-only exclusions (not prefixes) — for a page that has its own
// complete nav (a way back to the dashboard + an account/logout menu) but
// whose sibling routes don't. `/build` (Sky, components/Builder.tsx) has
// its own "← Dashboard" link plus a ProfileMenu avatar dropdown (account
// settings/admin panel/logout) already in its top-right corner — found
// live 2026-08-18: GlobalMenuButton's floating bottom-left "MENU" button
// was pure redundant clutter there, overlapping Sky's own chat input. Its
// sibling `/build/templates` has no such nav of its own and still needs
// GlobalMenuButton, so this can't just be a `/build` prefix — it has to
// match `/build` exactly.
export const ACCOUNT_CHROME_EXACT_PATHS = ['/build']

export function withClientRequestsLink(navItems: NavItem[], clientCompanyLabel: string | null): NavItem[] {
  if (!clientCompanyLabel) return navItems
  return [...navItems.slice(0, 1), { href: '/dashboard/requests', label: 'Requests', icon: '📋' }, ...navItems.slice(1)]
}
