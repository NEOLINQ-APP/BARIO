import { getStripe } from '@/lib/stripe'

export type StripeRiskLevel = 'normal' | 'elevated' | 'highest' | 'unknown'

// A `mode: 'subscription'` Checkout Session has no payment_intent of its own
// (unlike `mode: 'payment'`) — the actual charge lives on the subscription's
// first invoice. Radar's risk_level lives on that invoice's payment
// intent's latest charge, several hops away from the webhook's own session
// object, so this is a follow-up API call, not something read directly off
// the event payload. Defaults to 'unknown' on any failure (missing data,
// non-card payment method, Radar not evaluating this charge) rather than
// throwing — the first-order/account-age checks in shouldHoldForReview
// still apply independently of risk level.
export async function getRiskLevelForSubscriptionCheckout(subscriptionId: string): Promise<StripeRiskLevel> {
  try {
    const stripe = getStripe()
    const sub = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice.payment_intent.latest_charge'],
    })
    const invoice = sub.latest_invoice as any
    const charge = invoice?.payment_intent?.latest_charge
    const riskLevel = charge?.outcome?.risk_level
    if (riskLevel === 'normal' || riskLevel === 'elevated' || riskLevel === 'highest') return riskLevel
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

// Concrete implementation of "friction on first-time/high-risk purchases" —
// the classic abuse pattern for instant-provision compute is a stolen card
// on a brand-new account, so every account's first VPS order is held for a
// human look regardless of Radar's own score. Cheap, one-time-per-customer
// insurance rather than a recurring cost once an account is established.
export function shouldHoldForReview(opts: {
  riskLevel: StripeRiskLevel
  isFirstVpsOrderForUser: boolean
  accountAgeHours: number
}): boolean {
  if (opts.riskLevel === 'elevated' || opts.riskLevel === 'highest') return true
  if (opts.isFirstVpsOrderForUser) return true
  if (opts.accountAgeHours < 48) return true
  return false
}
