import { NextResponse } from 'next/server'
import { getStripe, PLAN_PRICE_IDS } from '@/lib/stripe'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { creditsForPlan } from '@/lib/credits'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { plan, billingCycle } = await req.json()
    const cycle = billingCycle === 'annual' ? 'annual' : 'monthly'
    const priceId = PLAN_PRICE_IDS[plan]?.[cycle]
    if (!priceId) {
      return NextResponse.json({ error: 'Unknown plan or billing cycle' }, { status: 400 })
    }

    const sql = await db()
    const rows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = rows[0]
    if (!user) {
      return NextResponse.json({ error: 'Account not found' }, { status: 401 })
    }

    const origin = req.headers.get('origin') ?? 'https://bario.ca'

    // Admin bypass: no reason the account owner should ever hand Stripe a
    // real card for a plan they already get every paid perk of via
    // hasPaidPlan()'s is_admin check — just comp it directly, same effect
    // as the admin grant-plan tool. Reseller products (VPS, mail hosting)
    // are deliberately NOT covered here — those carry real third-party
    // infrastructure cost, not something Bario can just wave through.
    if (user.is_admin) {
      await sql`
        UPDATE users
        SET plan = ${plan}, subscription_status = 'active',
            credits_remaining = ${creditsForPlan(plan)}, credits_reset_at = now() + interval '1 month'
        WHERE id = ${user.id}
      `
      return NextResponse.json({ url: `${origin}/dashboard?checkout=success` })
    }

    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      customer_email: user.email,
      client_reference_id: user.id,
      metadata: { plan, userId: user.id, billingCycle: cycle },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/hosting#pricing`,
      allow_promotion_codes: true,
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
