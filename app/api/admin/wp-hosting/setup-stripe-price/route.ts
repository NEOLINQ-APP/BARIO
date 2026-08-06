import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getStripe } from '@/lib/stripe'
import { WP_SHARED_PRICE_CENTS_CAD } from '@/lib/wpSharedTiers'
import { errorResponse } from '@/lib/errors'

// One-off, same pattern as /api/admin/vps/setup-stripe-prices — creates the
// real Stripe Price object for the shared-hosting flat monthly
// subscription. Re-running creates a fresh duplicate rather than detecting
// an existing one, so don't call this again without cleaning up the first
// one in the Stripe Dashboard.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  try {
    const stripe = getStripe()
    const product = await stripe.products.create({ name: 'Bario Shared WordPress Hosting' })
    const price = await stripe.prices.create({
      product: product.id,
      currency: 'cad',
      unit_amount: WP_SHARED_PRICE_CENTS_CAD,
      recurring: { interval: 'month' },
    })
    return NextResponse.json({ ok: true, productId: product.id, priceId: price.id })
  } catch (err) {
    return errorResponse(err)
  }
}
