import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getStripe } from '@/lib/stripe'
import { BO_MODULE_KEYS, BO_MODULES } from '@/lib/barioOneModules'
import { errorResponse } from '@/lib/errors'

// One-off, same shape as setup-stripe-prices (the old 3-tier version) —
// creates one real Stripe Product+Price per module. Re-running creates
// fresh duplicates rather than detecting existing ones, so don't call this
// again without cleaning up the prior ones in Stripe. Uses whichever
// STRIPE_SECRET_KEY is configured (test or live) — run this against a
// TEST-mode key first and verify before ever pointing it at live.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  try {
    const stripe = getStripe()
    const results: Record<string, { productId: string; priceId: string; envVar: string }> = {}

    for (const key of BO_MODULE_KEYS) {
      const module = BO_MODULES[key]
      const product = await stripe.products.create({ name: `Bario One — ${module.name}`, description: module.description })
      const price = await stripe.prices.create({
        product: product.id,
        currency: 'cad',
        unit_amount: module.priceCentsCad,
        recurring: { interval: 'month' },
      })
      results[key] = { productId: product.id, priceId: price.id, envVar: module.stripePriceEnvVar }
    }

    return NextResponse.json({ ok: true, results })
  } catch (err) {
    return errorResponse(err)
  }
}
