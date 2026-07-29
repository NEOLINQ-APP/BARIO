import { NextResponse } from 'next/server'
import { getStripe, VPS_PRICE_IDS, VPS_BACKUP_ADDON_PRICE_IDS } from '@/lib/stripe'
import { getSession } from '@/lib/session'
import { db, type User, type VpsInstance } from '@/lib/db'
import { isVpsTierKey, isBillingCycle } from '@/lib/vpsTiers'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user) return NextResponse.json({ error: 'Account not found' }, { status: 401 })

    const { orderId } = await req.json()
    if (typeof orderId !== 'string' || !orderId.trim()) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 })
    }

    const rows = (await sql`
      SELECT * FROM vps_instances WHERE id = ${orderId} AND user_id = ${user.id} AND status = 'pending_payment'
    `) as unknown as VpsInstance[]
    const order = rows[0]
    if (!order) {
      return NextResponse.json({ error: 'Order not found, already paid, or expired' }, { status: 404 })
    }
    if (!isVpsTierKey(order.tier) || !isBillingCycle(order.billing_cycle)) {
      return NextResponse.json({ error: 'Order has an invalid tier/billing cycle' }, { status: 400 })
    }

    const basePriceId = VPS_PRICE_IDS[order.tier][order.billing_cycle]
    if (!basePriceId) {
      return NextResponse.json({ error: 'That plan is not available for purchase right now' }, { status: 400 })
    }

    const lineItems: { price: string; quantity: number }[] = [{ price: basePriceId, quantity: 1 }]
    if (order.backup_addon) {
      const addonPriceId = VPS_BACKUP_ADDON_PRICE_IDS[order.tier][order.billing_cycle]
      if (addonPriceId) lineItems.push({ price: addonPriceId, quantity: 1 })
    }

    const origin = req.headers.get('origin') ?? 'https://bario.ca'

    // Same Stripe Customer as site-plan/storage billing when one already
    // exists — one customer across every Bario product, so the existing
    // billing portal already covers cancelling this too.
    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      ...(user.stripe_customer_id ? { customer: user.stripe_customer_id } : { customer_email: user.email }),
      client_reference_id: user.id,
      metadata: { vpsOrderId: orderId, userId: user.id },
      line_items: lineItems,
      success_url: `${origin}/dashboard/servers?checkout=success`,
      cancel_url: `${origin}/dashboard/servers/new`,
      allow_promotion_codes: true,
    })

    await sql`UPDATE vps_instances SET stripe_checkout_session_id = ${checkoutSession.id}, updated_at = now() WHERE id = ${orderId}`

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
