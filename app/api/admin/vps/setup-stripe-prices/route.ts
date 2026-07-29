import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getStripe } from '@/lib/stripe'
import { VPS_TIERS, VPS_TIER_KEYS, BILLING_CYCLES, BILLING_CYCLE_KEYS } from '@/lib/vpsTiers'
import { errorResponse } from '@/lib/errors'

// One-off setup tool: creates every Stripe Product/Price this feature needs
// but doesn't have yet (annual site-plan prices on the EXISTING plan
// products, plus 3 new VPS tier products each carrying a base price and a
// backup-addon price for all 4 billing cycles). Returns every resulting
// price ID so they can be set as env vars — safe to call more than once,
// each run just creates a fresh batch of prices (Stripe has no "does this
// exact price already exist" check, so don't run this twice in production
// without cleaning up the first batch in the Dashboard).
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const stripe = getStripe()
    const result: Record<string, string> = {}

    // Site-plan annual prices, attached to the SAME product as each
    // existing monthly price (not a new product) — same subscription
    // catalog entry, just a second billing option.
    const planMonthlyEnvVars: Record<string, string | undefined> = {
      starter: process.env.STRIPE_PRICE_STARTER,
      business: process.env.STRIPE_PRICE_BUSINESS,
      agency: process.env.STRIPE_PRICE_AGENCY,
    }
    const planAnnualAmounts: Record<string, number> = { starter: 19000, business: 49000, agency: 149000 }

    for (const [plan, monthlyPriceId] of Object.entries(planMonthlyEnvVars)) {
      if (!monthlyPriceId) {
        result[`${plan}_annual`] = `SKIPPED — no existing STRIPE_PRICE_${plan.toUpperCase()} to attach to`
        continue
      }
      const monthlyPrice = await stripe.prices.retrieve(monthlyPriceId)
      const productId = typeof monthlyPrice.product === 'string' ? monthlyPrice.product : monthlyPrice.product.id
      const annualPrice = await stripe.prices.create({
        product: productId,
        currency: 'cad',
        unit_amount: planAnnualAmounts[plan],
        recurring: { interval: 'year', interval_count: 1 },
        nickname: `${plan} — annual`,
      })
      result[`STRIPE_PRICE_${plan.toUpperCase()}_ANNUAL`] = annualPrice.id
    }

    // VPS: one Product per tier, one Price per (cycle) and one per
    // (backup-addon, cycle) — 8 prices per tier, 3 tiers.
    for (const tierKey of VPS_TIER_KEYS) {
      const tier = VPS_TIERS[tierKey]
      const product = await stripe.products.create({ name: `Bario VPS — ${tier.label}` })

      for (const cycleKey of BILLING_CYCLE_KEYS) {
        const cycle = BILLING_CYCLES[cycleKey]
        const cyclePricing = tier.cycles[cycleKey]

        const basePrice = await stripe.prices.create({
          product: product.id,
          currency: 'cad',
          unit_amount: cyclePricing.priceCentsCad,
          recurring: { interval: cycle.stripeInterval, interval_count: cycle.stripeIntervalCount },
          nickname: `VPS ${tier.label} — ${cycle.label}`,
        })
        result[`STRIPE_PRICE_VPS_${tierKey.toUpperCase()}_${cycleKey.toUpperCase()}`] = basePrice.id

        const addonPrice = await stripe.prices.create({
          product: product.id,
          currency: 'cad',
          unit_amount: cyclePricing.backupAddonPriceCentsCad,
          recurring: { interval: cycle.stripeInterval, interval_count: cycle.stripeIntervalCount },
          nickname: `VPS ${tier.label} backup add-on — ${cycle.label}`,
        })
        result[`STRIPE_PRICE_VPS_${tierKey.toUpperCase()}_BACKUP_${cycleKey.toUpperCase()}`] = addonPrice.id
      }
    }

    return NextResponse.json({ ok: true, envVars: result })
  } catch (err: any) {
    return errorResponse(err)
  }
}
