import { NextResponse } from 'next/server'
import { getStripe, PLAN_PRICE_IDS } from '@/lib/stripe'

export async function POST(req: Request) {
  try {
    const { plan } = await req.json()
    const priceId = PLAN_PRICE_IDS[plan]

    if (!priceId) {
      return NextResponse.json({ error: 'Unknown plan' }, { status: 400 })
    }

    const origin = req.headers.get('origin') ?? 'https://bario.ca'

    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/#pricing`,
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
