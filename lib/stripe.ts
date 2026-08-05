import Stripe from 'stripe'
import { VPS_TIER_KEYS, BILLING_CYCLE_KEYS, type VpsTierKey, type BillingCycle } from '@/lib/vpsTiers'

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
