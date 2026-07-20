import { NextResponse } from 'next/server'
import { getStripe, PLAN_PRICE_IDS } from '@/lib/stripe'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { plan } = await req.json()
    const priceId = PLAN_PRICE_IDS[plan]
    if (!priceId) {
      return NextResponse.json({ error: 'Unknown plan' }, { status: 400 })
    }

    const sql = await db()
    const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = rows[0]
    if (!user) {
      return NextResponse.json({ error: 'Account not found' }, { status: 401 })
    }

    const origin = req.headers.get('origin') ?? 'https://bario.ca'

    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      customer_email: user.email,
      client_reference_id: user.id,
      metadata: { plan, userId: user.id },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/#pricing`,
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
