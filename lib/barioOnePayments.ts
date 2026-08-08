import { getStripe } from '@/lib/stripe'
import { triggerWebhooks } from '@/lib/barioOneWebhooks'
import type { BoOrganization, BoInvoice, BoInvoiceItem } from '@/lib/db'

// Bario's own cut of every payment collected through a tenant's connected
// account. 0 until a real pricing/revenue-share decision is made — this is
// a placeholder pending business confirmation, same posture as VPS_TIERS'
// and WP_SHARED_PRICE_CENTS_CAD's flagged placeholder pricing. Never
// silently charge tenants a platform fee they didn't agree to.
export const BARIO_PAYMENTS_FEE_PERCENT = 0

export async function getOrCreateConnectAccount(sql: any, org: BoOrganization): Promise<string> {
  if (org.stripe_connect_account_id) return org.stripe_connect_account_id

  const stripe = getStripe()
  const account = await stripe.accounts.create({
    type: 'express',
    business_profile: { name: org.name },
    metadata: { boOrgId: org.id },
  })
  await sql`
    UPDATE bo_organizations SET stripe_connect_account_id = ${account.id}, stripe_connect_status = 'onboarding', updated_at = now()
    WHERE id = ${org.id}
  `
  return account.id
}

export async function createOnboardingLink(accountId: string, returnUrl: string, refreshUrl: string): Promise<string> {
  const stripe = getStripe()
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: 'account_onboarding',
    return_url: returnUrl,
    refresh_url: refreshUrl,
  })
  return link.url
}

// Always checks live against Stripe rather than trusting a possibly-stale
// DB value or a webhook that may not be configured to reach this endpoint
// for Connect events — this project has already been bitten once this
// session by an unverifiable external dashboard-config dependency (the
// RunPod auto-build), so the more robust "ask the source of truth
// directly" pattern is deliberate here, not an oversight.
export async function refreshConnectStatus(sql: any, org: BoOrganization): Promise<{ status: string; accountId: string | null; chargesEnabled: boolean; detailsSubmitted: boolean }> {
  if (!org.stripe_connect_account_id) return { status: 'none', accountId: null, chargesEnabled: false, detailsSubmitted: false }

  const stripe = getStripe()
  const account = await stripe.accounts.retrieve(org.stripe_connect_account_id)
  const status = account.charges_enabled ? 'active' : account.details_submitted ? 'onboarding' : 'onboarding'

  if (status !== org.stripe_connect_status) {
    await sql`UPDATE bo_organizations SET stripe_connect_status = ${status}, updated_at = now() WHERE id = ${org.id}`
  }
  return { status, accountId: org.stripe_connect_account_id, chargesEnabled: Boolean(account.charges_enabled), detailsSubmitted: Boolean(account.details_submitted) }
}

export async function createBoInvoicePaymentSession(
  org: BoOrganization,
  invoice: BoInvoice,
  lineItems: BoInvoiceItem[],
  customerEmail: string | null,
  origin: string
): Promise<string> {
  if (!org.stripe_connect_account_id) throw new Error('This business has not connected online payments yet')
  const stripe = getStripe()

  const items = lineItems.map((li) => ({
    price_data: {
      currency: invoice.currency.toLowerCase(),
      unit_amount: li.unit_price_cents,
      product_data: { name: li.description },
    },
    quantity: Math.round(Number(li.quantity)),
  }))

  const taxPercent = Number(invoice.tax_percent)
  if (taxPercent > 0) {
    const subtotal = lineItems.reduce((sum, li) => sum + Number(li.quantity) * li.unit_price_cents, 0)
    const taxCents = Math.round((subtotal * taxPercent) / 100)
    if (taxCents > 0) {
      items.push({
        price_data: { currency: invoice.currency.toLowerCase(), unit_amount: taxCents, product_data: { name: `${invoice.tax_label} (${taxPercent}%)` } },
        quantity: 1,
      })
    }
  }

  const subtotalCents = lineItems.reduce((sum, li) => sum + Number(li.quantity) * li.unit_price_cents, 0)
  const discountCents =
    invoice.discount_type === 'percent'
      ? Math.round((subtotalCents * Number(invoice.discount_value)) / 100)
      : invoice.discount_type === 'fixed'
      ? Math.round(Number(invoice.discount_value))
      : 0

  let discounts: { coupon: string }[] | undefined
  if (discountCents > 0) {
    // Coupon must live on the connected account itself (this session uses
    // {stripeAccount}, a direct charge) — a platform-level coupon id isn't
    // visible to the connected account's own Checkout session.
    const coupon = await stripe.coupons.create(
      { amount_off: Math.min(discountCents, subtotalCents), currency: invoice.currency.toLowerCase(), duration: 'once', name: `${invoice.number} discount` },
      { stripeAccount: org.stripe_connect_account_id }
    )
    discounts = [{ coupon: coupon.id }]
  }

  const applicationFeeAmount =
    BARIO_PAYMENTS_FEE_PERCENT > 0
      ? Math.round((subtotalCents - discountCents) * (1 + taxPercent / 100) * (BARIO_PAYMENTS_FEE_PERCENT / 100))
      : undefined

  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      customer_email: customerEmail ?? undefined,
      metadata: { boInvoiceId: invoice.id },
      line_items: items,
      ...(discounts ? { discounts } : {}),
      ...(applicationFeeAmount ? { payment_intent_data: { application_fee_amount: applicationFeeAmount } } : {}),
      success_url: `${origin}/bo-invoice/${invoice.public_token}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/bo-invoice/${invoice.public_token}`,
    },
    { stripeAccount: org.stripe_connect_account_id }
  )
  return session.url!
}

// Verifies directly against Stripe (never trusts the client-supplied
// `?paid=1` alone — that's just a UX hint, not proof) before ever marking
// an invoice paid. Idempotent: a second call after the invoice is already
// paid is a safe no-op rather than double-processing.
export async function confirmBoInvoicePayment(sql: any, org: BoOrganization, invoice: BoInvoice, sessionId: string): Promise<boolean> {
  if (invoice.status === 'paid') return true
  if (!org.stripe_connect_account_id) return false

  const stripe = getStripe()
  const session = await stripe.checkout.sessions.retrieve(sessionId, {}, { stripeAccount: org.stripe_connect_account_id })
  if (session.metadata?.boInvoiceId !== invoice.id) return false
  if (session.payment_status !== 'paid') return false

  await sql`
    UPDATE bo_invoices SET status = 'paid', paid_at = now(), stripe_checkout_session_id = ${session.id},
      stripe_payment_intent = ${String(session.payment_intent ?? '')}, updated_at = now()
    WHERE id = ${invoice.id} AND status != 'paid'
  `
  await triggerWebhooks(sql, org.id, 'invoice.paid', { invoiceId: invoice.id, number: invoice.number, customerId: invoice.customer_id })
  return true
}
