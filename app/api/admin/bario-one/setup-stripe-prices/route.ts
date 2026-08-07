import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getStripe } from '@/lib/stripe'
import { BO_PLANS } from '@/lib/barioOneTiers'
import { errorResponse } from '@/lib/errors'

// One-off, same pattern as /api/admin/wp-hosting/setup-stripe-price — creates
// the real Stripe Products/Prices for Bario One's three self-serve tiers.
// Re-running creates fresh duplicates rather than detecting existing ones,
// so don't call this again without cleaning up the prior ones in Stripe.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  try {
    const stripe = getStripe()
    const results: Record<string, { productId: string; priceId: string }> = {}

    for (const key of ['starter', 'professional', 'business'] as const) {
      const plan = BO_PLANS[key]
      if (plan.priceCentsCad === null) continue
      const product = await stripe.products.create({ name: `Bario One — ${plan.name}` })
      const price = await stripe.prices.create({
        product: product.id,
        currency: 'cad',
        unit_amount: plan.priceCentsCad,
        recurring: { interval: 'month' },
      })
      results[key] = { productId: product.id, priceId: price.id }
    }

    return NextResponse.json({ ok: true, results })
  } catch (err) {
    return errorResponse(err)
  }
}
