import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { creditsForPlan } from '@/lib/credits'
import type Stripe from 'stripe'

export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  let event: Stripe.Event

  try {
    event = getStripe().webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 })
  }

  const sql = await db()

  // Mirrors hasBuilderAccess(): any status other than 'active' means no
  // builder access, so a live published site should come down with it.
  // Admins are exempt since they get free access regardless of billing
  // status. custom_domain/domain_status are left alone — unpublishing is
  // fully reversible, and resubscribing shouldn't require reconnecting DNS.
  async function unpublishForCustomer(stripeCustomerId: string) {
    await sql`
      UPDATE sites SET is_published = false
      WHERE is_published = true
        AND user_id IN (SELECT id FROM users WHERE stripe_customer_id = ${stripeCustomerId} AND is_admin = false)
    `
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session

      const userId = session.client_reference_id ?? session.metadata?.userId
      const plan = session.metadata?.plan
      if (userId) {
        await sql`
          UPDATE users
          SET plan = ${plan ?? null},
              subscription_status = 'active',
              stripe_customer_id = ${String(session.customer)},
              stripe_subscription_id = ${String(session.subscription)},
              credits_remaining = ${creditsForPlan(plan ?? null)},
              credits_reset_at = now() + interval '1 month'
          WHERE id = ${userId}
        `
      }
      break
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      await sql`
        UPDATE users
        SET subscription_status = ${sub.status}
        WHERE stripe_customer_id = ${String(sub.customer)}
      `
      if (sub.status !== 'active') {
        await unpublishForCustomer(String(sub.customer))
      }
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      await sql`
        UPDATE users
        SET subscription_status = 'canceled'
        WHERE stripe_customer_id = ${String(sub.customer)}
      `
      await unpublishForCustomer(String(sub.customer))
      break
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      await sql`
        UPDATE users
        SET subscription_status = 'past_due'
        WHERE stripe_customer_id = ${String(invoice.customer)}
      `
      await unpublishForCustomer(String(invoice.customer))
      break
    }
  }

  return NextResponse.json({ received: true })
}
