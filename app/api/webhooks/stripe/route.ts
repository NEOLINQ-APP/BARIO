import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import type Stripe from 'stripe'

function generateLicenseKey() {
  return `BARIO-${randomUUID().toUpperCase().replace(/-/g, '').slice(0, 20).match(/.{1,5}/g)!.join('-')}`
}

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

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session

      if (session.mode === 'payment' && session.metadata?.kind === 'template_license') {
        const userId = session.metadata.userId
        const templateId = session.metadata.templateId
        if (userId && templateId) {
          await sql`
            INSERT INTO template_licenses (id, user_id, template_id, license_key, status, stripe_payment_intent)
            VALUES (${randomUUID()}, ${userId}, ${templateId}, ${generateLicenseKey()}, 'pending_approval', ${String(session.payment_intent)})
          `
        }
        break
      }

      const userId = session.client_reference_id ?? session.metadata?.userId
      const plan = session.metadata?.plan
      if (userId) {
        await sql`
          UPDATE users
          SET plan = ${plan ?? null},
              subscription_status = 'active',
              stripe_customer_id = ${String(session.customer)},
              stripe_subscription_id = ${String(session.subscription)}
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
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      await sql`
        UPDATE users
        SET subscription_status = 'canceled'
        WHERE stripe_customer_id = ${String(sub.customer)}
      `
      break
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      await sql`
        UPDATE users
        SET subscription_status = 'past_due'
        WHERE stripe_customer_id = ${String(invoice.customer)}
      `
      break
    }
  }

  return NextResponse.json({ received: true })
}
