import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { getStripe } from '@/lib/stripe'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { instanceId, refund } = await req.json()
    if (typeof instanceId !== 'string' || !instanceId.trim()) {
      return NextResponse.json({ error: 'instanceId is required' }, { status: 400 })
    }

    const rows = (await sql`
      SELECT id, stripe_subscription_id FROM vps_instances WHERE id = ${instanceId} AND status = 'pending_review'
    `) as unknown as { id: string; stripe_subscription_id: string | null }[]
    const order = rows[0]
    if (!order) {
      await logAdminAction(sql, { action: 'vps-reject', params: { instanceId }, result: 'error', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
      return NextResponse.json({ error: 'No pending_review order found with that id' }, { status: 404 })
    }

    if (order.stripe_subscription_id) {
      const stripe = getStripe()
      if (refund === true) {
        const sub = await stripe.subscriptions.retrieve(order.stripe_subscription_id, { expand: ['latest_invoice.payment_intent'] })
        const paymentIntentId = (sub.latest_invoice as any)?.payment_intent?.id
        if (paymentIntentId) await stripe.refunds.create({ payment_intent: paymentIntentId })
      }
      await stripe.subscriptions.cancel(order.stripe_subscription_id)
    }

    await sql`UPDATE vps_instances SET status = 'rejected', updated_at = now() WHERE id = ${instanceId}`

    await logAdminAction(sql, { action: 'vps-reject', params: { instanceId, refund: !!refund }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
