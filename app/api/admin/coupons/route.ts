import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getStripe } from '@/lib/stripe'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'

// Coupons/promo codes for influencers & promoters — thin wrapper over
// Stripe's own Coupon + Promotion Code objects rather than a parallel
// discount system, since checkout already supports promotion codes
// (allow_promotion_codes: true). A "trackable URL" is just
// bario.ca/hosting?promo=<code> — app/api/checkout looks that param up and
// auto-applies it (see that route).
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const stripe = getStripe()
    const codes = await stripe.promotionCodes.list({ limit: 100, expand: ['data.promotion.coupon'] })
    const results = codes.data.map((pc) => {
      const coupon = pc.promotion.coupon
      const couponObj = typeof coupon === 'string' ? null : coupon
      return {
        id: pc.id,
        code: pc.code,
        active: pc.active,
        timesRedeemed: pc.times_redeemed,
        maxRedemptions: pc.max_redemptions,
        percentOff: couponObj?.percent_off ?? null,
        amountOffCents: couponObj?.amount_off ?? null,
        currency: couponObj?.currency ?? null,
        duration: couponObj?.duration ?? 'once',
        durationInMonths: couponObj?.duration_in_months ?? null,
        url: `https://bario.ca/hosting?promo=${pc.code}`,
      }
    })
    return NextResponse.json({ ok: true, codes: results })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { code, percentOff, amountOffCents, duration, durationInMonths, maxRedemptions } = await req.json()
    if (typeof code !== 'string' || !/^[A-Z0-9_-]{3,40}$/i.test(code)) {
      return NextResponse.json({ error: 'code must be 3-40 letters/numbers/-/_ characters' }, { status: 400 })
    }
    if (!percentOff && !amountOffCents) {
      return NextResponse.json({ error: 'Provide either percentOff or amountOffCents' }, { status: 400 })
    }
    const validDurations = ['once', 'repeating', 'forever']
    if (!validDurations.includes(duration)) {
      return NextResponse.json({ error: `duration must be one of: ${validDurations.join(', ')}` }, { status: 400 })
    }

    const stripe = getStripe()
    const coupon = await stripe.coupons.create({
      ...(percentOff ? { percent_off: percentOff } : { amount_off: amountOffCents, currency: 'cad' }),
      duration,
      ...(duration === 'repeating' ? { duration_in_months: durationInMonths } : {}),
    })
    const promotionCode = await stripe.promotionCodes.create({
      promotion: { type: 'coupon', coupon: coupon.id },
      code: code.toUpperCase(),
      ...(maxRedemptions ? { max_redemptions: maxRedemptions } : {}),
    })

    await logAdminAction(sql, {
      action: 'coupon-created',
      params: { code: promotionCode.code, percentOff, amountOffCents, duration },
      result: 'ok',
      triggeredBy: 'admin',
    })

    return NextResponse.json({ ok: true, code: promotionCode.code, url: `https://bario.ca/hosting?promo=${promotionCode.code}` })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { promotionCodeId } = await req.json()
    const stripe = getStripe()
    await stripe.promotionCodes.update(promotionCodeId, { active: false })
    await logAdminAction(sql, { action: 'coupon-deactivated', params: { promotionCodeId }, result: 'ok', triggeredBy: 'admin' })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
