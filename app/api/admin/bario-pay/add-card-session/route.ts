import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getStripe } from '@/lib/stripe'
import { getOrCreateBarioPayCustomerId } from '@/lib/barioPay'
import { errorResponse } from '@/lib/errors'

// Real card collection happens entirely on Stripe's own hosted page --
// same mode-based Checkout Session pattern already used everywhere else
// in this codebase (app/api/checkout, app/api/bario-one/checkout), just
// mode: 'setup' instead of 'payment'/'subscription'. Bario's own servers
// and database never see the card number at any point.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const customerId = await getOrCreateBarioPayCustomerId(sql)
    const origin = req.headers.get('origin') ?? 'https://www.bario.ca'

    const session = await getStripe().checkout.sessions.create({
      mode: 'setup',
      customer: customerId,
      payment_method_types: ['card'],
      success_url: `${origin}/admin/bario-pay?added_card_session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/admin/bario-pay`,
    })
    return NextResponse.json({ ok: true, url: session.url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
