import type { BoPlan } from '@/lib/db'

// Real prices from the approved Bario One spec. Unlike VPS_TIERS/
// WP_SHARED_PRICE_CENTS_CAD (placeholder pricing pending margin
// confirmation), these were given as final by the user — still USD/CAD
// currency TBD, priced here in CAD cents to match every other product on
// this platform (VPS, WP hosting, storage) being CAD-denominated.
export const BO_PLAN_KEYS = ['starter', 'professional', 'business', 'enterprise'] as const

export type BoPlanConfig = {
  key: BoPlan
  name: string
  priceCentsCad: number | null // null => Enterprise, contact sales, no Stripe price
  seatLimit: number | null // null => unlimited
  trialDays: number
  features: string[]
}

export const BO_PLANS: Record<BoPlan, BoPlanConfig> = {
  starter: {
    key: 'starter',
    name: 'Starter',
    priceCentsCad: 4900,
    seatLimit: 2,
    trialDays: 14,
    features: ['2 users', 'CRM', 'Customers', 'Estimates', 'Invoices', 'Reports'],
  },
  professional: {
    key: 'professional',
    name: 'Professional',
    priceCentsCad: 14900,
    seatLimit: 10,
    trialDays: 14,
    features: ['10 users', 'CRM', 'Invoicing', 'Expenses', 'Automation', 'AI Assistant', 'Employee management'],
  },
  business: {
    key: 'business',
    name: 'Business',
    priceCentsCad: 29900,
    seatLimit: null,
    trialDays: 14,
    features: ['Unlimited users', 'Payroll tools', 'Inventory', 'POS', 'Advanced reporting', 'API access'],
  },
  enterprise: {
    key: 'enterprise',
    name: 'Enterprise',
    priceCentsCad: null,
    seatLimit: null,
    trialDays: 0,
    features: ['White label', 'Dedicated database', 'Custom integrations'],
  },
}

export function isBoPlan(value: string): value is BoPlan {
  return (BO_PLAN_KEYS as readonly string[]).includes(value)
}
