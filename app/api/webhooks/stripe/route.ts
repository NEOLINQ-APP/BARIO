import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getStripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import { creditsForPlan } from '@/lib/credits'
import { isStorageTierKey } from '@/lib/storageTiers'
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

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.client_reference_id ?? session.metadata?.userId
      const templateId = session.metadata?.templateId
      const storageTier = session.metadata?.storageTier

      if (session.mode === 'payment' && userId && templateId) {
        // One-time template purchase — never touches plan/subscription_status.
        await sql`
          INSERT INTO template_licenses (id, user_id, template_id, license_key, status, stripe_payment_intent)
          VALUES (${randomUUID()}, ${userId}, ${templateId}, ${randomUUID()}, 'active', ${String(session.payment_intent)})
        `
        break
      }

      if (session.mode === 'subscription' && userId && storageTier && isStorageTierKey(storageTier)) {
        // A separate subscription from the site plan — a user can be on any
        // (or no) site plan and independently pay for more storage.
        await sql`
          UPDATE users
          SET storage_tier = ${storageTier},
              storage_subscription_status = 'active',
              stripe_customer_id = COALESCE(stripe_customer_id, ${String(session.customer)}),
              stripe_storage_subscription_id = ${String(session.subscription)}
          WHERE id = ${userId}
        `
        break
      }

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
      const subId = sub.id

      // A customer can now have two independent subscriptions (site plan +
      // storage) — match on the specific subscription ID, not just the
      // customer, so an event for one never clobbers the other.
      const storageMatch = (await sql`SELECT id FROM users WHERE stripe_storage_subscription_id = ${subId}`) as { id: string }[]
      if (storageMatch.length > 0) {
        if (sub.status === 'active') {
          await sql`UPDATE users SET storage_subscription_status = ${sub.status} WHERE stripe_storage_subscription_id = ${subId}`
        } else {
          await sql`UPDATE users SET storage_subscription_status = ${sub.status}, storage_tier = 'free' WHERE stripe_storage_subscription_id = ${subId}`
        }
        break
      }

      // Building/hosting is free for everyone now — a lapsed subscription
      // only affects paid perks (badge removal, custom domain, extra
      // credits), never takes a site offline. Resetting plan to null on
      // anything other than active means credits fall back to the free
      // tier's allotment instead of staying at the old paid amount forever.
      if (sub.status === 'active') {
        await sql`UPDATE users SET subscription_status = ${sub.status} WHERE stripe_subscription_id = ${subId}`
      } else {
        await sql`UPDATE users SET subscription_status = ${sub.status}, plan = NULL WHERE stripe_subscription_id = ${subId}`
      }
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const subId = sub.id

      const storageMatch = (await sql`SELECT id FROM users WHERE stripe_storage_subscription_id = ${subId}`) as { id: string }[]
      if (storageMatch.length > 0) {
        await sql`
          UPDATE users SET storage_subscription_status = 'canceled', storage_tier = 'free', stripe_storage_subscription_id = NULL
          WHERE stripe_storage_subscription_id = ${subId}
        `
        break
      }

      await sql`
        UPDATE users
        SET subscription_status = 'canceled', plan = NULL
        WHERE stripe_subscription_id = ${subId}
      `
      break
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      // Stripe's typed SDK shape for this field varies by API version; read
      // it defensively rather than fighting the type definitions.
      const rawSub = (invoice as any).subscription
      const subId: string | undefined = typeof rawSub === 'string' ? rawSub : rawSub?.id
      if (!subId) break

      const storageMatch = (await sql`SELECT id FROM users WHERE stripe_storage_subscription_id = ${subId}`) as { id: string }[]
      if (storageMatch.length > 0) {
        await sql`UPDATE users SET storage_subscription_status = 'past_due', storage_tier = 'free' WHERE stripe_storage_subscription_id = ${subId}`
        break
      }

      await sql`
        UPDATE users
        SET subscription_status = 'past_due', plan = NULL
        WHERE stripe_subscription_id = ${subId}
      `
      break
    }
  }

  return NextResponse.json({ received: true })
}
