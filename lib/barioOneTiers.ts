import type { BoPlan } from '@/lib/db'
import type { BoModuleKey } from '@/lib/barioOneModules'
import { BO_MODULE_KEYS } from '@/lib/barioOneModules'

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
  // Which modules a bundled-tier checkout actually grants
  // (app/api/webhooks/stripe/route.ts reads this at checkout.session.completed
  // time). Was referenced there but never defined — a real, build-breaking
  // gap found while deploying an unrelated change. Reconstructed here from
  // each tier's own `features` copy on a cumulative-tier assumption (each
  // tier is a superset of the one below it, only the newly-added
  // capabilities are called out in its marketing features list) — this is
  // a first-pass, best-effort mapping and should be reviewed/confirmed
  // against the actual product spec before this billing path goes live.
  modules: BoModuleKey[]
}

export const BO_PLANS: Record<BoPlan, BoPlanConfig> = {
  starter: {
    key: 'starter',
    name: 'Starter',
    priceCentsCad: 4900,
    seatLimit: 2,
    trialDays: 14,
    features: ['2 users', 'CRM', 'Customers', 'Estimates', 'Invoices', 'Reports'],
    modules: ['crm', 'invoicing'],
  },
  professional: {
    key: 'professional',
    name: 'Professional',
    priceCentsCad: 14900,
    seatLimit: 10,
    trialDays: 14,
    features: ['10 users', 'CRM', 'Invoicing', 'Expenses', 'Automation', 'AI Assistant', 'Employee management'],
    modules: ['crm', 'invoicing', 'employees', 'ai_assistant'],
  },
  business: {
    key: 'business',
    name: 'Business',
    priceCentsCad: 29900,
    seatLimit: null,
    trialDays: 14,
    features: ['Unlimited users', 'Payroll tools', 'Inventory', 'POS', 'Advanced reporting', 'API access'],
    modules: [...BO_MODULE_KEYS], // top self-serve tier — everything
  },
  enterprise: {
    key: 'enterprise',
    name: 'Enterprise',
    priceCentsCad: null,
    seatLimit: null,
    trialDays: 0,
    features: ['White label', 'Dedicated database', 'Custom integrations'],
    modules: [...BO_MODULE_KEYS], // no self-serve Stripe price, sold manually
  },
}

export function isBoPlan(value: string): value is BoPlan {
  return (BO_PLAN_KEYS as readonly string[]).includes(value)
}

// Payroll module add-on pricing, used by BarioOneRoiCalculator.tsx and the
// module-billing line-item builders. Placeholder pending real sign-off —
// same open item already tracked in TODO.md for VPS/domain/module pricing
// (that doc's flat "$39/mo" payroll figure predates this base+per-employee
// structure; $15 base + $5/employee lands close to that reference point for
// a mid-sized team, but neither number is final).
export const PAYROLL_BASE_CENTS_CAD = 1500
export const PAYROLL_PER_EMPLOYEE_CENTS_CAD = 500
