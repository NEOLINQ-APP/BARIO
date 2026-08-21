import type { BoModuleKey } from '@/lib/barioOneModules'

// Business OS Phase 1 — secondary nav for /dashboard/bario-one/*, same
// data-driven shape as lib/accountNav.ts's ACCOUNT_NAV_ITEMS. moduleKey
// reuses the existing billed module set (lib/barioOneModules.ts) rather
// than inventing a parallel gating system — Spott/Website have no
// existing module and stay ungated placeholders (comingSoon) rather than
// invented paid modules, since that's real billing-system surface
// (Stripe price env vars, resolveModuleDependencies, signup UI) out of
// scope for an architecture/routing pass.
export type BarioOneNavItem = {
  href: string
  label: string
  icon: string
  moduleKey: BoModuleKey | null
  comingSoon?: boolean
}

export const BARIO_ONE_NAV_ITEMS: BarioOneNavItem[] = [
  { href: '/dashboard/bario-one', label: 'Dashboard', icon: '🏠', moduleKey: null },
  { href: '/dashboard/bario-one/crm', label: 'CRM', icon: '🧑‍💼', moduleKey: 'crm' },
  { href: '/dashboard/bario-one/sales', label: 'Sales', icon: '📈', moduleKey: 'crm' },
  { href: '/dashboard/bario-one/marketing', label: 'Marketing', icon: '📣', moduleKey: 'crm' },
  { href: '/dashboard/bario-one/spott', label: 'Spott', icon: '📍', moduleKey: null, comingSoon: true },
  { href: '/dashboard/bario-one/assistant', label: 'AI', icon: '🤖', moduleKey: 'ai_assistant' },
  { href: '/dashboard/bario-one/website', label: 'Website', icon: '🌐', moduleKey: null, comingSoon: true },
  { href: '/dashboard/bario-one/appointments', label: 'Appointments', icon: '📅', moduleKey: 'crm' },
  { href: '/dashboard/bario-one/finance', label: 'Finance', icon: '💰', moduleKey: 'invoicing' },
  { href: '/dashboard/bario-one/reports', label: 'Analytics', icon: '📊', moduleKey: null },
  { href: '/dashboard/bario-one/crm/automations', label: 'Automations', icon: '⚡', moduleKey: 'crm' },
  { href: '/dashboard/bario-one/settings', label: 'Settings', icon: '⚙️', moduleKey: null },
]
