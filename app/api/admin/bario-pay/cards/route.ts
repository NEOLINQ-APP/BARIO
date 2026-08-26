import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import Stripe from 'stripe'
import { requireAdmin } from '@/lib/admin'
import { getStripe } from '@/lib/stripe'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const cards = await sql`SELECT id, brand, last4, exp_month, exp_year, nickname FROM bario_pay_cards ORDER BY created_at DESC`
    return NextResponse.json({ ok: true, cards })
  } catch (err: any) {
    return errorResponse(err)
  }
}

// Saves a card AFTER the customer completed Stripe's own hosted setup
// Checkout -- resolves the real PaymentMethod server-side from the
// Checkout Session id (never trusts a client-supplied Stripe object id
// directly). Only Stripe's own safe display metadata (brand/last4/expiry)
// ever reaches Bario's database -- the real card number never does.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const { checkoutSessionId, nickname } = await req.json()
    if (typeof checkoutSessionId !== 'string' || !checkoutSessionId.trim()) {
      return NextResponse.json({ error: 'checkoutSessionId is required' }, { status: 400 })
    }

    const session = await getStripe().checkout.sessions.retrieve(checkoutSessionId, { expand: ['setup_intent'] })
    const setupIntent = session.setup_intent as Stripe.SetupIntent | null
    const paymentMethodId = typeof setupIntent?.payment_method === 'string' ? setupIntent.payment_method : setupIntent?.payment_method?.id
    if (!paymentMethodId) return NextResponse.json({ error: 'No card was saved on that session' }, { status: 400 })

    const pm = await getStripe().paymentMethods.retrieve(paymentMethodId)
    if (!pm.card) return NextResponse.json({ error: 'Not a card payment method' }, { status: 400 })

    const id = randomUUID()
    await sql`
      INSERT INTO bario_pay_cards (id, stripe_payment_method_id, brand, last4, exp_month, exp_year, nickname)
      VALUES (${id}, ${pm.id}, ${pm.card.brand}, ${pm.card.last4}, ${pm.card.exp_month}, ${pm.card.exp_year}, ${nickname || null})
      ON CONFLICT (stripe_payment_method_id) DO NOTHING
    `
    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
