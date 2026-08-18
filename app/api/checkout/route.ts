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

    const { plan, billingCycle, promoCode } = await req.json()
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

    if (user.comp_protected_until && new Date(user.comp_protected_until).getTime() > Date.now()) {
      return NextResponse.json(
        { error: `This account has a billing hold on file until ${new Date(user.comp_protected_until).toLocaleDateString()} — contact Bario directly to add real billing before then.` },
        { status: 403 }
      )
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

    // A promo link (bario.ca/hosting?promo=CODE, see app/api/admin/coupons)
    // auto-applies that code instead of showing the manual entry field —
    // Stripe doesn't allow both discounts and allow_promotion_codes on the
    // same session, so this is one or the other. An invalid/expired code in
    // the URL silently falls back to manual entry rather than blocking
    // checkout entirely.
    const stripe = getStripe()
    let discounts: { promotion_code: string }[] | undefined
    if (typeof promoCode === 'string' && promoCode.trim()) {
      const found = await stripe.promotionCodes.list({ code: promoCode.trim().toUpperCase(), active: true, limit: 1 })
      if (found.data[0]) discounts = [{ promotion_code: found.data[0].id }]
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: user.email,
      client_reference_id: user.id,
      metadata: { plan, userId: user.id, billingCycle: cycle },
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/hosting#pricing`,
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
