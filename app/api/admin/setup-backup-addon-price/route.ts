import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getStripe, BACKUP_ADDON_PRICE_CENTS } from '@/lib/stripe'
import { errorResponse } from '@/lib/errors'

// One-off, same shape as setup-module-prices -- creates the real Stripe
// Product+Price for the $9/mo Backup Protection add-on (signed off
// 2026-08-30). Re-running creates a fresh duplicate rather than detecting
// an existing one, so don't call this again without cleaning up the prior
// Price in Stripe first.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  try {
    const stripe = getStripe()
    const product = await stripe.products.create({
      name: 'Bario — Backup Protection',
      description: 'Automatic backups of your site and data, so it can be recovered if something goes wrong.',
    })
    const price = await stripe.prices.create({
      product: product.id,
      currency: 'cad',
      unit_amount: BACKUP_ADDON_PRICE_CENTS,
      recurring: { interval: 'month' },
    })
    return NextResponse.json({ ok: true, productId: product.id, priceId: price.id, envVar: 'STRIPE_PRICE_BACKUP_ADDON' })
  } catch (err) {
    return errorResponse(err)
  }
}
