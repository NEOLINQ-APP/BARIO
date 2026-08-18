import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import * as Sentry from '@sentry/nextjs'
import { getStripe, moduleKeyForPriceId, tierKeyForPriceId } from '@/lib/stripe'
import { sendSms } from '@/lib/twilio'
import { recordIncident } from '@/lib/neoIncidents'
import { BO_PLANS } from '@/lib/barioOneTiers'
import type { BoModuleKey } from '@/lib/barioOneModules'
import { db, type VpsInstance } from '@/lib/db'
import { creditsForPlan } from '@/lib/credits'
import { isStorageTierKey } from '@/lib/storageTiers'
import { provisionVpsInstance } from '@/lib/vpsProvision'
import { provisionWpSharedSite, deprovisionWpSharedSite } from '@/lib/wpSharedProvision'
import { shouldHoldForReview, getRiskLevelForSubscriptionCheckout } from '@/lib/vpsRisk'
import { powerOffServer, deleteServer } from '@/lib/hetzner'
import { registerDomain, setDomainNameservers, type RegistrantContact } from '@/lib/registrar'
import { provisionCloudflareZone } from '@/lib/domainConnect'
import { addDomainToVercel } from '@/lib/vercel'
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

      // One-off Bario Voice reconnection payments (app/api/admin/bario-voice/
      // create-payment-link) — not a real bo_invoices/subscription record,
      // just a flat one-time amount. The only thing to do here is tell a
      // human immediately: SMS (same EXEC_ALERT_PHONE_NUMBER pipeline as
      // Aria's refund escalation) plus a durable NEO incident so it shows
      // up in /admin/neo even if the text is missed.
      if (session.mode === 'payment' && session.metadata?.purpose === 'bario_voice_reconnection') {
        const company = session.metadata?.company ?? 'Unknown company'
        const amount = session.amount_total != null ? `$${(session.amount_total / 100).toFixed(2)} ${(session.currency ?? 'cad').toUpperCase()}` : 'an unknown amount'
        try {
          const alertNumber = process.env.EXEC_ALERT_PHONE_NUMBER
          if (alertNumber) {
            await sendSms(alertNumber, `Bario Voice: ${company} just paid ${amount} to reconnect. Restore their account + phone line when ready.`)
          }
        } catch (err) {
          console.error('Failed to send Bario Voice payment SMS alert:', err)
          Sentry.captureException(err)
        }
        await recordIncident(sql, {
          source: 'stripe_webhook',
          category: 'bario_voice_payment_received',
          severity: 'info',
          description: `${company} paid ${amount} to reconnect Bario Voice service.`,
          details: { sessionId: session.id, company, amountTotal: session.amount_total },
        })
        break
      }

      const invoiceId = session.metadata?.invoiceId
      if (session.mode === 'payment' && invoiceId) {
        await sql`
          UPDATE invoices
          SET status = 'paid', paid_at = now(), stripe_checkout_session_id = ${session.id}, stripe_payment_intent = ${String(session.payment_intent)}, updated_at = now()
          WHERE id = ${invoiceId} AND status != 'paid'
        `
        break
      }

      const domainOrderId = session.metadata?.domainOrderId
      if (session.mode === 'payment' && userId && domainOrderId) {
        // Payment confirmed FIRST, only now do we actually call Namecheap —
        // this is deliberately the one and only place a domain purchase
        // registers for real, so a customer can never end up charged-but-
        // not-registered or registered-for-free. Isolated in its own
        // try/catch and always falls through to the unconditional 200
        // below (same reasoning as the VPS branch) — a failure here leaves
        // the order in 'pending_payment'/'failed' for manual follow-up
        // rather than making Stripe retry this delivery forever.
        try {
          const orderRows = (await sql`
            SELECT * FROM domain_orders WHERE id = ${domainOrderId} AND status = 'pending_payment'
          `) as unknown as {
            id: string; domain: string; years: number; site_id: string | null; contact_json: string | null
          }[]
          const order = orderRows[0]
          if (!order) break // already processed (duplicate delivery) or unknown order id

          const contact = JSON.parse(order.contact_json ?? '{}') as RegistrantContact
          const result = await registerDomain(order.domain, order.years, contact)

          await sql`
            UPDATE domain_orders
            SET status = ${result.registered ? 'registered' : 'failed'},
                registrar_order_id = ${result.orderId},
                charged_amount = ${result.chargedAmount},
                stripe_checkout_session_id = ${session.id},
                stripe_payment_intent = ${String(session.payment_intent)}
            WHERE id = ${order.id}
          `

          if (result.registered && order.site_id) {
            // Fully automate "connect this domain" — unlike a domain the
            // customer already owned elsewhere, we control this domain's
            // registrar account, so we can point its nameservers at
            // Cloudflare ourselves instead of asking the customer to.
            const zone = await provisionCloudflareZone(order.domain)
            if (zone) {
              await setDomainNameservers(order.domain, zone.nameservers).catch((err) => {
                console.error('domain nameserver update error', err)
                Sentry.captureException(err)
              })
              await addDomainToVercel(order.domain).catch((err) => {
                console.error('domain vercel add error', err)
                Sentry.captureException(err)
              })
              await sql`
                UPDATE sites
                SET custom_domain = ${order.domain}, domain_status = 'pending', cloudflare_zone_id = ${zone.zoneId}, nameservers = ${zone.nameservers.join(',')}
                WHERE id = ${order.site_id}
              `
              await sql`UPDATE domain_orders SET connected_to_site = true WHERE id = ${order.id}`
            }
          }
        } catch (err) {
          console.error('domain registration error', err)
          Sentry.captureException(err)
        }
        break
      }

      const vpsOrderId = session.metadata?.vpsOrderId
      if (session.mode === 'subscription' && userId && vpsOrderId) {
        // Isolated in its own try/catch, deliberately swallowed rather than
        // rethrown — this route must always fall through to the
        // unconditional 200 below, or Stripe retries this delivery
        // indefinitely. Retries aren't needed for correctness anyway:
        // provisionVpsInstance's own status guard makes a duplicate call a
        // safe no-op, and a failure here surfaces as `provision_failed` for
        // an admin to retry explicitly (see /api/admin/vps/retry-provision).
        try {
          const rows = (await sql`SELECT * FROM vps_instances WHERE id = ${vpsOrderId} AND status = 'pending_payment'`) as unknown as VpsInstance[]
          const order = rows[0]
          if (!order) break // already processed (duplicate delivery) or unknown order id

          const subId = String(session.subscription)
          const riskLevel = await getRiskLevelForSubscriptionCheckout(subId)

          const accountRows = (await sql`SELECT created_at FROM users WHERE id = ${userId}`) as unknown as { created_at: string }[]
          const accountAgeHours = accountRows[0] ? (Date.now() - new Date(accountRows[0].created_at).getTime()) / 3_600_000 : 0

          const priorRows = (await sql`
            SELECT count(*)::int AS count FROM vps_instances
            WHERE user_id = ${userId} AND status NOT IN ('pending_payment', 'rejected')
          `) as unknown as { count: number }[]
          const isFirstVpsOrder = priorRows[0].count === 0

          const heldForReview = shouldHoldForReview({ riskLevel, isFirstVpsOrderForUser: isFirstVpsOrder, accountAgeHours })

          await sql`
            UPDATE vps_instances
            SET stripe_customer_id = ${String(session.customer)},
                stripe_subscription_id = ${subId},
                paid_at = now(),
                risk_flag = ${heldForReview ? 'review' : 'none'},
                status = ${heldForReview ? 'pending_review' : 'awaiting_provision'},
                updated_at = now()
            WHERE id = ${vpsOrderId}
          `

          if (!heldForReview) {
            await provisionVpsInstance(sql, vpsOrderId)
          }
        } catch (err) {
          console.error('vps provisioning error', err)
          Sentry.captureException(err)
        }
        break
      }

      const convertVpsId = session.metadata?.convertVpsId
      if (session.mode === 'payment' && userId && convertVpsId) {
        // The customer already ran /api/sites/migrate against their live
        // WordPress site and reviewed the result BEFORE paying this fee
        // (see app/api/vps/[id]/convert-to-static/route.ts) — this branch's
        // only job is to cancel the underlying VPS subscription, which the
        // existing 'customer.subscription.deleted' handler below already
        // knows how to tear down (delete the Hetzner server, mark
        // deprovisioned) — reused as-is, not duplicated here.
        try {
          const rows = (await sql`SELECT stripe_subscription_id FROM vps_instances WHERE id = ${convertVpsId} AND user_id = ${userId} AND status = 'active'`) as unknown as { stripe_subscription_id: string | null }[]
          const order = rows[0]
          if (order?.stripe_subscription_id) {
            await getStripe().subscriptions.cancel(order.stripe_subscription_id)
          }
        } catch (err) {
          console.error('convert-to-static cancellation error', err)
          Sentry.captureException(err)
        }
        break
      }

      const wpSiteId = session.metadata?.wpSiteId
      if (session.mode === 'subscription' && userId && wpSiteId) {
        // Mirrors the vpsOrderId branch above exactly — isolated try/catch,
        // swallowed rather than rethrown, since provisionWpSharedSite's own
        // status guard makes a duplicate delivery a safe no-op and a real
        // failure surfaces as provision_failed for an admin to retry via
        // /api/admin/wp-hosting/sites/[id]/retry-provision.
        try {
          const rows = (await sql`SELECT id FROM wp_sites WHERE id = ${wpSiteId} AND status = 'pending_payment'`) as unknown as { id: string }[]
          if (rows[0]) {
            await sql`
              UPDATE wp_sites
              SET stripe_customer_id = ${String(session.customer)}, stripe_subscription_id = ${String(session.subscription)},
                  status = 'awaiting_provision', updated_at = now()
              WHERE id = ${wpSiteId}
            `
            await provisionWpSharedSite(sql, wpSiteId)
          }
        } catch (err) {
          console.error('wp shared hosting provisioning error', err)
          Sentry.captureException(err)
        }
        break
      }

      const voiceAgentOrderId = session.metadata?.voiceAgentOrderId
      if (session.mode === 'subscription' && userId && voiceAgentOrderId) {
        // Payment confirmed -> pending_build, for an admin to assign a real
        // Twilio number and activate in the build panel. Deliberately NOT
        // auto-provisioned like VPS — this product needs a human to pick a
        // real phone number (Twilio number search/purchase automation
        // doesn't exist yet, see the plan this was built from), so the
        // webhook's job here is just the payment-confirmed state
        // transition, same "swallow and fall through to 200" reasoning as
        // the other branches — a failure here shouldn't make Stripe retry
        // forever, it just leaves the order visible as still pending_payment
        // for manual follow-up.
        try {
          const rows = (await sql`SELECT id FROM voice_agent_orders WHERE id = ${voiceAgentOrderId} AND status = 'pending_payment'`) as unknown as { id: string }[]
          if (rows[0]) {
            await sql`
              UPDATE voice_agent_orders
              SET stripe_subscription_id = ${String(session.subscription)}, status = 'pending_build', updated_at = now()
              WHERE id = ${voiceAgentOrderId}
            `
          }
        } catch (err) {
          console.error('voice agent order payment error', err)
          Sentry.captureException(err)
        }
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

      const boOrgId = session.metadata?.boOrgId
      if (session.mode === 'subscription' && userId && boOrgId) {
        // moduleKeys is set by the a-la-carte checkout route
        // (app/api/bario-one/modules/checkout); boTierPlan/boTierBilling
        // is set by the bundled-tier checkout route
        // (app/api/bario-one/checkout). Exactly one of the two is present
        // on any given session — a tier checkout sets enabled_modules_json
        // from the tier's module set directly (BO_PLANS[plan].modules is
        // already a fully dependency-resolved list, hand-authored to be
        // one), an a-la-carte checkout uses the modules it resolved itself.
        const moduleKeysJson = session.metadata?.moduleKeys
        const tierPlan = session.metadata?.boTierPlan
        const tierBilling = session.metadata?.boTierBilling === 'annual' ? 'annual' : 'monthly'
        const tierModulesJson = tierPlan && tierPlan in BO_PLANS ? JSON.stringify(BO_PLANS[tierPlan as keyof typeof BO_PLANS].modules) : null

        await sql`
          UPDATE bo_organizations
          SET stripe_customer_id = ${String(session.customer)},
              stripe_subscription_id = ${String(session.subscription)},
              subscription_status = 'active',
              enabled_modules_json = COALESCE(${tierModulesJson ?? moduleKeysJson ?? null}, enabled_modules_json),
              plan = COALESCE(${tierPlan ?? null}, plan),
              tier_active = ${Boolean(tierModulesJson)},
              billing_period = ${tierBilling},
              updated_at = now()
          WHERE id = ${boOrgId}
        `
        break
      }

      if (session.mode === 'subscription') {
        // External client subscriptions (Bario Dialer / Voice Agent billed
        // to AFC Logistics, Sunbuilt Group, etc.) have no Bario userId —
        // matched by checkout session id instead, set by
        // app/api/admin/client-subscriptions/route.ts.
        const extRows = (await sql`SELECT id FROM external_client_subscriptions WHERE stripe_checkout_session_id = ${session.id}`) as unknown as { id: string }[]
        if (extRows[0]) {
          await sql`
            UPDATE external_client_subscriptions
            SET status = 'active', stripe_subscription_id = ${String(session.subscription)}, updated_at = now()
            WHERE id = ${extRows[0].id}
          `
          break
        }
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

      const vpsMatch = (await sql`SELECT id FROM vps_instances WHERE stripe_subscription_id = ${subId}`) as { id: string }[]
      if (vpsMatch.length > 0) {
        if (sub.status === 'active') {
          // Recovered (e.g. customer updated a failed card) — only clears
          // past_due, never touches suspended/canceled states, which need
          // their own explicit paths (reveal-password-style deliberate
          // action, not an automatic side effect of a status flip back).
          await sql`UPDATE vps_instances SET status = 'active', updated_at = now() WHERE stripe_subscription_id = ${subId} AND status = 'past_due'`
        } else {
          await sql`
            UPDATE vps_instances SET status = 'past_due', updated_at = now()
            WHERE stripe_subscription_id = ${subId} AND status NOT IN ('suspended', 'canceled_pending_deprovision', 'deprovisioned')
          `
        }
        break
      }

      const boMatch = (await sql`SELECT id FROM bo_organizations WHERE stripe_subscription_id = ${subId}`) as { id: string }[]
      if (boMatch.length > 0) {
        // Stripe's subscription items are the reconciled source of truth
        // for which modules/tier are actually being billed — re-derive
        // enabled_modules_json (and tier_active/plan) from them on every
        // update (covers the self-serve add/remove route, a tier
        // upgrade/downgrade, any change made directly in the Stripe
        // dashboard, and proration events), not just subscription_status.
        // A price that doesn't map to a known module or tier is simply
        // skipped rather than erroring.
        const tierMatches = sub.items.data
          .map((item) => tierKeyForPriceId(item.price.id))
          .filter((key): key is NonNullable<typeof key> => Boolean(key))
        const tierPlan = tierMatches[0] // a subscription only ever carries one tier price at a time
        const tierModules: BoModuleKey[] = tierPlan ? BO_PLANS[tierPlan].modules : []

        const addOnModules = sub.items.data
          .map((item) => moduleKeyForPriceId(item.price.id))
          .filter((key): key is NonNullable<typeof key> => Boolean(key))

        const moduleKeys = Array.from(new Set([...tierModules, ...addOnModules]))

        if (moduleKeys.length > 0) {
          await sql`
            UPDATE bo_organizations
            SET subscription_status = ${sub.status},
                enabled_modules_json = ${JSON.stringify(moduleKeys)},
                plan = COALESCE(${tierPlan ?? null}, plan),
                tier_active = ${Boolean(tierPlan)},
                updated_at = now()
            WHERE stripe_subscription_id = ${subId}
          `
        } else {
          await sql`UPDATE bo_organizations SET subscription_status = ${sub.status}, tier_active = false, updated_at = now() WHERE stripe_subscription_id = ${subId}`
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

      const extCancelMatch = (await sql`SELECT id FROM external_client_subscriptions WHERE stripe_subscription_id = ${subId}`) as { id: string }[]
      if (extCancelMatch.length > 0) {
        await sql`UPDATE external_client_subscriptions SET status = 'canceled', updated_at = now() WHERE stripe_subscription_id = ${subId}`
        break
      }

      const storageMatch = (await sql`SELECT id FROM users WHERE stripe_storage_subscription_id = ${subId}`) as { id: string }[]
      if (storageMatch.length > 0) {
        await sql`
          UPDATE users SET storage_subscription_status = 'canceled', storage_tier = 'free', stripe_storage_subscription_id = NULL
          WHERE stripe_storage_subscription_id = ${subId}
        `
        break
      }

      const vpsMatch = (await sql`SELECT id, hetzner_server_id FROM vps_instances WHERE stripe_subscription_id = ${subId}`) as { id: string; hetzner_server_id: string | null }[]
      if (vpsMatch.length > 0) {
        const order = vpsMatch[0]
        // Durable write first — if the Hetzner delete below fails, the row
        // stays in this exact state for the reconciliation cron to retry,
        // rather than silently reverting to "active" and hiding the failure.
        await sql`UPDATE vps_instances SET status = 'canceled_pending_deprovision', updated_at = now() WHERE id = ${order.id}`
        try {
          if (order.hetzner_server_id) await deleteServer(order.hetzner_server_id)
          await sql`UPDATE vps_instances SET status = 'deprovisioned', deprovisioned_at = now(), updated_at = now() WHERE id = ${order.id}`
        } catch (err) {
          console.error('vps deprovision error', err)
          Sentry.captureException(err)
        }
        break
      }

      const wpSharedMatch = (await sql`SELECT id FROM wp_sites WHERE stripe_subscription_id = ${subId}`) as { id: string }[]
      if (wpSharedMatch.length > 0) {
        try {
          await deprovisionWpSharedSite(sql, wpSharedMatch[0].id)
        } catch (err) {
          console.error('wp shared deprovision error (webhook)', err)
          Sentry.captureException(err)
        }
        break
      }

      // Cancellation never deletes the organization or its data (customers,
      // invoices, employees) — only flips billing status. Reactivating is
      // just a new checkout, same posture as every other product here.
      const boCancelMatch = (await sql`SELECT id FROM bo_organizations WHERE stripe_subscription_id = ${subId}`) as { id: string }[]
      if (boCancelMatch.length > 0) {
        await sql`UPDATE bo_organizations SET subscription_status = 'canceled', updated_at = now() WHERE stripe_subscription_id = ${subId}`
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

      // Bario One never had a dedicated branch here before — past-due
      // detection relied entirely on customer.subscription.updated also
      // firing with status: 'past_due', which Stripe typically does, but
      // not guaranteed to race ahead of a customer noticing. This mirrors
      // the generic `users` fallback below (flip status), without a
      // suspend mechanism — Bario One has no equivalent to powering off a
      // VPS, so there's nothing further to do here besides making the
      // status change immediate rather than waiting on a second event.
      const boFailedMatch = (await sql`SELECT id FROM bo_organizations WHERE stripe_subscription_id = ${subId}`) as { id: string }[]
      if (boFailedMatch.length > 0) {
        await sql`UPDATE bo_organizations SET subscription_status = 'past_due', updated_at = now() WHERE stripe_subscription_id = ${subId}`
        break
      }

      const vpsMatch = (await sql`SELECT id, hetzner_server_id FROM vps_instances WHERE stripe_subscription_id = ${subId}`) as { id: string; hetzner_server_id: string | null }[]
      if (vpsMatch.length > 0) {
        const order = vpsMatch[0]
        // next_payment_attempt is null once Stripe's own retry schedule is
        // exhausted (this is Stripe's own documented signal for "no more
        // retries coming") — only then does non-payment actually suspend
        // the server; every attempt before that is just a status flag,
        // matching hosting-industry norms for a grace period.
        const retriesExhausted = invoice.next_payment_attempt === null
        if (retriesExhausted) {
          try {
            if (order.hetzner_server_id) await powerOffServer(order.hetzner_server_id)
            await sql`UPDATE vps_instances SET status = 'suspended', suspended_at = now(), updated_at = now() WHERE id = ${order.id}`
          } catch (err) {
            console.error('vps suspend error', err)
            Sentry.captureException(err)
          }
        } else {
          await sql`
            UPDATE vps_instances SET status = 'past_due', updated_at = now()
            WHERE id = ${order.id} AND status NOT IN ('suspended', 'canceled_pending_deprovision', 'deprovisioned')
          `
        }
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
