import Stripe from 'stripe'
import { VPS_TIER_KEYS, BILLING_CYCLE_KEYS, type VpsTierKey, type BillingCycle } from '@/lib/vpsTiers'
import { BO_MODULE_KEYS, BO_MODULES, type BoModuleKey } from '@/lib/barioOneModules'

let _stripe: Stripe | undefined

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  }
  return _stripe
}

// Site plans now offer monthly or annual billing (annual ~17% off, "pay for
// 10 months, get 12" framing). Existing monthly price IDs are unchanged;
// annual is a new, separate Price attached to the same Stripe Product.
export const PLAN_PRICE_IDS: Record<string, { monthly: string | undefined; annual: string | undefined }> = {
  starter: { monthly: process.env.STRIPE_PRICE_STARTER, annual: process.env.STRIPE_PRICE_STARTER_ANNUAL },
  business: { monthly: process.env.STRIPE_PRICE_BUSINESS, annual: process.env.STRIPE_PRICE_BUSINESS_ANNUAL },
  agency: { monthly: process.env.STRIPE_PRICE_AGENCY, annual: process.env.STRIPE_PRICE_AGENCY_ANNUAL },
}

// e.g. tier 'small', cycle 'biennial' -> STRIPE_PRICE_VPS_SMALL_BIENNIAL
function vpsEnvKey(tier: VpsTierKey, cycle: BillingCycle, addon: boolean): string {
  return addon
    ? `STRIPE_PRICE_VPS_${tier.toUpperCase()}_BACKUP_${cycle.toUpperCase()}`
    : `STRIPE_PRICE_VPS_${tier.toUpperCase()}_${cycle.toUpperCase()}`
}

function buildVpsPriceMap(addon: boolean): Record<VpsTierKey, Record<BillingCycle, string | undefined>> {
  const map = {} as Record<VpsTierKey, Record<BillingCycle, string | undefined>>
  for (const tier of VPS_TIER_KEYS) {
    map[tier] = {} as Record<BillingCycle, string | undefined>
    for (const cycle of BILLING_CYCLE_KEYS) {
      map[tier][cycle] = process.env[vpsEnvKey(tier, cycle, addon)]
    }
  }
  return map
}

// The backup add-on's price matches whichever cycle the customer picks for
// the server itself (rather than always billing monthly), so the server +
// add-on stay as line items on ONE Stripe subscription — Stripe requires
// every price in a single subscription to share the same billing interval.
export const VPS_PRICE_IDS = buildVpsPriceMap(false)
export const VPS_BACKUP_ADDON_PRICE_IDS = buildVpsPriceMap(true)

// Voice Agent reseller — single flat monthly subscription, no tiers (unlike
// VPS). Per-call Twilio/ElevenLabs/Claude usage is a real cost this price
// needs to cover with margin, not billed separately to the customer.
export const VOICE_AGENT_PRICE_ID = process.env.STRIPE_PRICE_VOICE_AGENT

// Shared WordPress Hosting (Product B) — one flat tier for v1, same
// single-subscription shape as Voice Agent above.
export const WP_SHARED_PRICE_ID = process.env.STRIPE_PRICE_WP_SHARED

// Bario One payroll module add-on — base + per-employee Stripe Price
// objects. Both undefined until real prices are created in Stripe (see
// PAYROLL_BASE_CENTS_CAD/PAYROLL_PER_EMPLOYEE_CENTS_CAD in barioOneTiers.ts
// for the placeholder cents values these need to match once created) —
// barioOneModuleLineItems.ts and barioOnePayrollBilling.ts already guard
// against either being unset, so this is safe to leave unconfigured.
export const BO_PAYROLL_BASE_PRICE_ID = process.env.STRIPE_PRICE_BO_PAYROLL_BASE
export const BO_PAYROLL_PER_EMPLOYEE_PRICE_ID = process.env.STRIPE_PRICE_BO_PAYROLL_PER_EMPLOYEE

// Bario One — Starter/Professional/Business flat monthly tiers. Enterprise
// is deliberately absent (contact-sales, no self-serve Stripe checkout).
// Superseded by BO_MODULE_PRICE_IDS below for new billing — left in place
// (not deleted) since it's harmless and nothing forces an existing
// subscription off it.
export const BO_PLAN_PRICE_IDS: Record<'starter' | 'professional' | 'business', string | undefined> = {
  starter: process.env.STRIPE_PRICE_BO_STARTER,
  professional: process.env.STRIPE_PRICE_BO_PROFESSIONAL,
  business: process.env.STRIPE_PRICE_BO_BUSINESS,
}

// Bario One — one recurring Price per module, the real billing mechanism
// behind modular/a-la-carte packaging. Built from each module's own
// stripePriceEnvVar so the catalog in lib/barioOneModules.ts stays the
// single place a module's identity is defined.
export const BO_MODULE_PRICE_IDS: Record<BoModuleKey, string | undefined> = Object.fromEntries(
  BO_MODULE_KEYS.map((key) => [key, process.env[BO_MODULES[key].stripePriceEnvVar]])
) as Record<BoModuleKey, string | undefined>

// Reverse lookup used by the Stripe webhook to reconcile enabled_modules_json
// from a subscription's actual line-item prices (Stripe is the source of
// truth for what's really being billed).
export function moduleKeyForPriceId(priceId: string): BoModuleKey | undefined {
  return BO_MODULE_KEYS.find((key) => BO_MODULE_PRICE_IDS[key] === priceId)
}

// Same reverse-lookup shape as moduleKeyForPriceId above, for the legacy
// flat-tier prices (BO_PLAN_PRICE_IDS) — was referenced by the Stripe
// webhook but never actually defined, a pre-existing build-breaking gap
// found while deploying an unrelated change.
export function tierKeyForPriceId(priceId: string): keyof typeof BO_PLAN_PRICE_IDS | undefined {
  return (Object.keys(BO_PLAN_PRICE_IDS) as (keyof typeof BO_PLAN_PRICE_IDS)[]).find(
    (key) => BO_PLAN_PRICE_IDS[key] === priceId
  )
}
