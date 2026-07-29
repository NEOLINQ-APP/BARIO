import Stripe from 'stripe'

let _stripe: Stripe | undefined

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  }
  return _stripe
}

export const PLAN_PRICE_IDS: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  business: process.env.STRIPE_PRICE_BUSINESS,
  agency: process.env.STRIPE_PRICE_AGENCY,
}

// VPS tiers — fixed Dashboard-created Prices (not price_data) since there
// are only 3 tiers + 1 addon, matching PLAN_PRICE_IDS's pattern rather than
// media/checkout's inline price_data approach used for its 6 storage tiers.
export const VPS_TIER_PRICE_IDS: Record<string, string | undefined> = {
  small: process.env.STRIPE_PRICE_VPS_SMALL,
  medium: process.env.STRIPE_PRICE_VPS_MEDIUM,
  large: process.env.STRIPE_PRICE_VPS_LARGE,
}
export const VPS_BACKUP_ADDON_PRICE_ID = process.env.STRIPE_PRICE_VPS_BACKUP_ADDON
