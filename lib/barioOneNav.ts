import type { BoModuleKey } from '@/lib/barioOneModules'

// Business OS Steps 3-15 — 2-level nav. Every leaf gets a real, distinct
// route: 'real' leaves either link to already-existing pages (reuse, no
// duplication — see the href comments) or a genuinely new minimal
// scaffold; 'comingSoon' leaves render components/BarioOneComingSoon.tsx.
// No leaf is ever a dead button.
export type BarioOneNavLeaf = {
  href: string
  label: string
  moduleKey: BoModuleKey | null
  status: 'real' | 'comingSoon'
}
export type BarioOneNavSection = {
  key: string
  label: string
  icon: string
  href: string // the section's own landing page
  items: BarioOneNavLeaf[]
}

export const BARIO_ONE_NAV: BarioOneNavSection[] = [
  {
    key: 'dashboard', label: 'Dashboard', icon: '🏠', href: '/dashboard/bario-one',
    items: [],
  },
  {
    key: 'crm', label: 'CRM', icon: '🧑‍💼', href: '/dashboard/bario-one/crm',
    items: [
      { href: '/dashboard/bario-one/crm?stage=contact', label: 'Contacts', moduleKey: 'crm', status: 'real' },
      { href: '/dashboard/bario-one/crm?stage=lead', label: 'Leads', moduleKey: 'crm', status: 'real' },
      { href: '/dashboard/bario-one/crm?stage=customer', label: 'Customers', moduleKey: 'crm', status: 'real' },
      { href: '/dashboard/bario-one/crm/pipeline', label: 'Deals', moduleKey: 'crm', status: 'real' },
      { href: '/dashboard/bario-one/crm/pipeline', label: 'Pipelines', moduleKey: 'crm', status: 'real' },
      { href: '/dashboard/bario-one/crm/tasks', label: 'Tasks', moduleKey: 'crm', status: 'real' },
    ],
  },
  {
    key: 'sales', label: 'Sales', icon: '📈', href: '/dashboard/bario-one/sales',
    items: [
      { href: '/dashboard/bario-one/sales/opportunities', label: 'Opportunities', moduleKey: 'crm', status: 'real' },
      { href: '/dashboard/bario-one/sales/quotes', label: 'Quotes', moduleKey: 'invoicing', status: 'real' },
      { href: '/dashboard/bario-one/sales/products', label: 'Products', moduleKey: 'pos', status: 'real' },
      { href: '/dashboard/bario-one/sales/services', label: 'Services', moduleKey: 'crm', status: 'comingSoon' },
    ],
  },
  {
    key: 'marketing', label: 'Marketing', icon: '📣', href: '/dashboard/bario-one/marketing',
    items: [
      { href: '/dashboard/bario-one/marketing', label: 'Marketing Hub', moduleKey: 'crm', status: 'real' },
      { href: '/dashboard/bario-one/marketing/campaigns', label: 'Campaigns', moduleKey: 'crm', status: 'comingSoon' },
      { href: '/dashboard/bario-one/marketing/email', label: 'Email', moduleKey: 'crm', status: 'real' },
      { href: '/dashboard/bario-one/marketing/sms', label: 'SMS', moduleKey: 'crm', status: 'comingSoon' },
      { href: '/dashboard/bario-one/marketing/promotions', label: 'Promotions', moduleKey: 'crm', status: 'comingSoon' },
      { href: '/dashboard/bario-one/marketing/coupons', label: 'Coupons', moduleKey: 'crm', status: 'comingSoon' },
      { href: '/dashboard/bario-one/marketing/referrals', label: 'Referrals', moduleKey: 'crm', status: 'comingSoon' },
      { href: '/dashboard/bario-one/marketing/reviews', label: 'Reviews', moduleKey: 'crm', status: 'comingSoon' },
      { href: '/dashboard/bario-one/marketing/seo', label: 'SEO', moduleKey: null, status: 'real' },
      { href: '/dashboard/bario-one/marketing/qr-codes', label: 'QR Codes', moduleKey: 'crm', status: 'comingSoon' },
    ],
  },
  {
    key: 'spott', label: 'Spott', icon: '📍', href: '/dashboard/bario-one/spott',
    items: [
      { href: '/dashboard/bario-one/spott/my-listing', label: 'My Listing', moduleKey: null, status: 'comingSoon' },
      { href: '/dashboard/bario-one/spott/marketplace', label: 'Marketplace', moduleKey: null, status: 'comingSoon' },
      { href: '/dashboard/bario-one/spott/leads', label: 'Leads', moduleKey: null, status: 'comingSoon' },
      { href: '/dashboard/bario-one/spott/promotions', label: 'Promotions', moduleKey: null, status: 'comingSoon' },
      { href: '/dashboard/bario-one/spott/reviews', label: 'Reviews', moduleKey: null, status: 'comingSoon' },
      { href: '/dashboard/bario-one/spott/analytics', label: 'Analytics', moduleKey: null, status: 'comingSoon' },
    ],
  },
  {
    key: 'ai', label: 'AI', icon: '🤖', href: '/dashboard/bario-one/assistant',
    items: [
      { href: '/dashboard/bario-one/assistant', label: 'AI Assistant', moduleKey: 'ai_assistant', status: 'real' },
      { href: '/dashboard/voice-agent', label: 'AI Receptionist', moduleKey: null, status: 'real' },
      { href: '/dashboard/bario-one/ai/sales-agent', label: 'AI Sales Agent', moduleKey: 'ai_assistant', status: 'comingSoon' },
      { href: '/dashboard/bario-one/ai/marketing-agent', label: 'AI Marketing Agent', moduleKey: 'ai_assistant', status: 'comingSoon' },
      { href: '/dashboard/bario-one/ai/content', label: 'AI Content', moduleKey: 'ai_assistant', status: 'comingSoon' },
    ],
  },
  {
    key: 'website', label: 'Website', icon: '🌐', href: '/dashboard/bario-one/website',
    items: [
      { href: '/dashboard/websites', label: 'Website', moduleKey: null, status: 'real' },
      { href: '/build', label: 'Pages', moduleKey: null, status: 'real' },
      { href: '/dashboard/bario-one/website/landing-pages', label: 'Landing Pages', moduleKey: null, status: 'comingSoon' },
      { href: '/dashboard/bario-one/website/forms', label: 'Forms', moduleKey: null, status: 'comingSoon' },
      { href: '/dashboard/domains', label: 'Domains', moduleKey: null, status: 'real' },
    ],
  },
  {
    key: 'appointments', label: 'Appointments', icon: '📅', href: '/dashboard/bario-one/appointments',
    items: [
      { href: '/dashboard/bario-one/appointments/calendar', label: 'Calendar', moduleKey: 'crm', status: 'comingSoon' },
      { href: '/dashboard/bario-one/appointments', label: 'Booking', moduleKey: 'crm', status: 'real' },
      { href: '/dashboard/bario-one/appointments/services', label: 'Services', moduleKey: 'crm', status: 'comingSoon' },
      { href: '/dashboard/bario-one/appointments/staff', label: 'Staff', moduleKey: 'crm', status: 'comingSoon' },
    ],
  },
  {
    key: 'finance', label: 'Finance', icon: '💰', href: '/dashboard/bario-one/finance',
    items: [
      { href: '/dashboard/bario-one/crm/invoices', label: 'Invoices', moduleKey: 'invoicing', status: 'real' },
      { href: '/dashboard/bario-one/payments', label: 'Payments', moduleKey: 'payments', status: 'real' },
      { href: '/dashboard/bario-one/expenses', label: 'Expenses', moduleKey: 'invoicing', status: 'real' },
    ],
  },
  {
    key: 'analytics', label: 'Analytics', icon: '📊', href: '/dashboard/bario-one/reports',
    items: [
      { href: '/dashboard/bario-one/reports', label: 'Business Analytics', moduleKey: null, status: 'real' },
      { href: '/dashboard/bario-one/crm/reports', label: 'Sales Analytics', moduleKey: 'crm', status: 'real' },
      { href: '/dashboard/bario-one/analytics/marketing', label: 'Marketing Analytics', moduleKey: 'crm', status: 'comingSoon' },
      { href: '/dashboard/bario-one/analytics/roi', label: 'ROI', moduleKey: null, status: 'comingSoon' },
    ],
  },
  {
    key: 'automations', label: 'Automations', icon: '⚡', href: '/dashboard/bario-one/crm/automations',
    items: [
      { href: '/dashboard/bario-one/crm/automations', label: 'Workflows', moduleKey: 'crm', status: 'real' },
      { href: '/dashboard/bario-one/automations/templates', label: 'Templates', moduleKey: 'crm', status: 'comingSoon' },
      { href: '/dashboard/bario-one/automations/runs', label: 'Runs', moduleKey: 'crm', status: 'real' },
    ],
  },
  {
    key: 'settings', label: 'Settings', icon: '⚙️', href: '/dashboard/bario-one/settings',
    items: [
      { href: '/dashboard/bario-one/company', label: 'Business', moduleKey: null, status: 'real' },
      { href: '/dashboard/bario-one/team', label: 'Team', moduleKey: null, status: 'real' },
      { href: '/dashboard/bario-one/api', label: 'Integrations', moduleKey: 'api_webhooks', status: 'real' },
      { href: '/dashboard/bario-one/modules', label: 'Billing', moduleKey: null, status: 'real' },
      { href: '/dashboard/bario-one/settings/security', label: 'Security', moduleKey: null, status: 'comingSoon' },
    ],
  },
]
