import { NextResponse } from 'next/server'
import { getStripe, VOICE_AGENT_PRICE_ID } from '@/lib/stripe'
import { getSession } from '@/lib/session'
import { db, type User, type VoiceAgentOrder } from '@/lib/db'
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
      SELECT * FROM voice_agent_orders WHERE id = ${orderId} AND user_id = ${user.id} AND status = 'pending_payment'
    `) as unknown as VoiceAgentOrder[]
    const order = rows[0]
    if (!order) {
      return NextResponse.json({ error: 'Order not found, already paid, or expired' }, { status: 404 })
    }
    if (!VOICE_AGENT_PRICE_ID) {
      return NextResponse.json({ error: 'The Voice Agent is not available for purchase right now' }, { status: 400 })
    }

    const origin = req.headers.get('origin') ?? 'https://bario.ca'

    // Same Stripe Customer as every other Bario product when one already
    // exists, matching the VPS/site-plan checkout pattern — one customer,
    // one billing portal covers cancelling this too.
    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      ...(user.stripe_customer_id ? { customer: user.stripe_customer_id } : { customer_email: user.email }),
      client_reference_id: user.id,
      metadata: { voiceAgentOrderId: orderId, userId: user.id },
      line_items: [{ price: VOICE_AGENT_PRICE_ID, quantity: 1 }],
      success_url: `${origin}/dashboard/voice-agent?checkout=success`,
      cancel_url: `${origin}/dashboard/voice-agent`,
      allow_promotion_codes: true,
    })

    await sql`UPDATE voice_agent_orders SET stripe_checkout_session_id = ${checkoutSession.id}, updated_at = now() WHERE id = ${orderId}`

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
