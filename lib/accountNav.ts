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
  { href: '/build/apps', label: 'Build (beta)', icon: '⚡' },
  { href: '/dashboard/servers', label: 'Servers', icon: '🖥️' },
  { href: '/dashboard/wp-hosting', label: 'WordPress Hosting', icon: '📝' },
  { href: '/dashboard/billing', label: 'Billing', icon: '💳' },
  { href: '/dashboard/account', label: 'Account', icon: '⚙️' },
]

// Pages that already render AccountSidebar (which has its own MENU button
// and drawer) — GlobalMenuButton skips these to avoid showing two menu
// triggers on the same page. Keep in sync with app/(account)'s route group.
export const ACCOUNT_CHROME_PREFIXES = ['/dashboard', '/media', '/victoria-app']

export function withClientRequestsLink(navItems: NavItem[], clientCompanyLabel: string | null): NavItem[] {
  if (!clientCompanyLabel) return navItems
  return [...navItems.slice(0, 1), { href: '/dashboard/requests', label: 'Requests', icon: '📋' }, ...navItems.slice(1)]
}
