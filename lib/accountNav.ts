export type NavItem = { href: string; label: string; icon: string }

// Shared with GlobalMenuButton (the fallback nav for in-app pages that have
// no nav of their own yet — see APP_FALLBACK_NAV_PREFIXES below) so both
// stay in sync automatically — add a new dashboard section here once, not
// in two places.
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

// Allowlist, not a blocklist — GlobalMenuButton only ever renders on a
// prefix listed here. Originally this was inverted (show everywhere logged
// in *except* pages known to already have their own chrome), which meant
// it silently showed up anywhere new: the public marketing landing page for
// a logged-in visitor, and worse, on `/site/[domain]/...` — the SAME app
// that renders every customer's own hosted website — since a `*.bario.ca`
// subdomain shares the bario.ca session cookie, so a logged-in admin
// browsing a customer's live site would see Bario's own internal nav
// overlaid on it. Found + fixed 2026-08-18. This button's whole purpose is
// helping a logged-in user navigate *our* app; it has no business anywhere
// else, so only add a prefix here when a specific in-app page genuinely has
// no nav of its own yet:
// - `/admin` — the admin panel has no nav of its own at all.
// - `/build/templates` — Sky's template gallery has no nav of its own
//   (unlike plain `/build`, which has its own Dashboard link + ProfileMenu
//   avatar dropdown already — deliberately NOT listed here).
export const APP_FALLBACK_NAV_PREFIXES = ['/admin', '/build/templates']

// Temporary lockdown, 2026-08-24 — see hasZeusStudioAccess in lib/access.ts.
// Filters Websites/Studio out of the nav entirely for anyone who can't
// currently reach them, rather than showing a dead link. Revert by
// deleting this function and going back to using ACCOUNT_NAV_ITEMS
// directly once access is reopened.
const LOCKDOWN_HIDDEN_HREFS = new Set(['/dashboard/websites', '/dashboard/studio'])
export function getAccountNavItems(opts: { canBuildStudio: boolean }): NavItem[] {
  if (opts.canBuildStudio) return ACCOUNT_NAV_ITEMS
  return ACCOUNT_NAV_ITEMS.filter((item) => !LOCKDOWN_HIDDEN_HREFS.has(item.href))
}

export function withClientRequestsLink(navItems: NavItem[], clientCompanyLabel: string | null): NavItem[] {
  if (!clientCompanyLabel) return navItems
  return [...navItems.slice(0, 1), { href: '/dashboard/requests', label: 'Requests', icon: '📋' }, ...navItems.slice(1)]
}
