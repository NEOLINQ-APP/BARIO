import { NextResponse } from 'next/server'
import { getStripe, WP_SHARED_PRICE_ID } from '@/lib/stripe'
import { getSession } from '@/lib/session'
import { db, type User, type WpSite } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user) return NextResponse.json({ error: 'Account not found' }, { status: 401 })

    const { siteId } = await req.json()
    if (typeof siteId !== 'string' || !siteId.trim()) {
      return NextResponse.json({ error: 'siteId is required' }, { status: 400 })
    }
    if (!WP_SHARED_PRICE_ID) {
      return NextResponse.json({ error: 'This plan is not available for purchase right now' }, { status: 400 })
    }

    const rows = (await sql`
      SELECT * FROM wp_sites WHERE id = ${siteId} AND user_id = ${user.id} AND status = 'pending_payment'
    `) as unknown as WpSite[]
    const site = rows[0]
    if (!site) {
      return NextResponse.json({ error: 'Order not found, already paid, or expired' }, { status: 404 })
    }

    const origin = req.headers.get('origin') ?? 'https://bario.ca'

    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      ...(user.stripe_customer_id ? { customer: user.stripe_customer_id } : { customer_email: user.email }),
      client_reference_id: user.id,
      metadata: { wpSiteId: siteId, userId: user.id },
      line_items: [{ price: WP_SHARED_PRICE_ID, quantity: 1 }],
      success_url: `${origin}/dashboard/wp-hosting?checkout=success`,
      cancel_url: `${origin}/dashboard/wp-hosting`,
      allow_promotion_codes: true,
    })

    await sql`UPDATE wp_sites SET stripe_checkout_session_id = ${checkoutSession.id}, updated_at = now() WHERE id = ${siteId}`

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
