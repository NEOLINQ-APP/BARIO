import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getStripe } from '@/lib/stripe'
import type { ExternalClientSubscription } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// Real recurring monthly billing for external clients who use Bario Dialer
// / Voice Agent but aren't Bario.ca account holders (AFC Logistics, Sunbuilt
// Group, ...). The one-time `invoices` table has no subscription concept,
// so this is the go-forward half -- creates a real Stripe Customer + a
// Checkout Session in subscription mode with a shared GST tax rate. Nothing
// charges until the client actually completes checkout; status starts
// 'pending_checkout' and only becomes 'active' once Stripe confirms it
// (see the webhook handler wiring this up -- app/api/stripe/webhook/route.ts
// needs a case for this customer's subscription events, added separately).
type LineItem = { name: string; unitAmountCents: number }

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const body = await req.json().catch(() => ({}))
    const clientKey = typeof body?.clientKey === 'string' ? body.clientKey.trim().toLowerCase() : ''
    const clientName = typeof body?.clientName === 'string' ? body.clientName.trim() : ''
    const clientEmail = typeof body?.clientEmail === 'string' ? body.clientEmail.trim() : null
    const lineItems: LineItem[] = Array.isArray(body?.lineItems) ? body.lineItems : []
    const taxPercent = typeof body?.taxPercent === 'number' ? body.taxPercent : 0

    if (!clientKey || !clientName || lineItems.length === 0) {
      return NextResponse.json({ error: 'clientKey, clientName, and at least one line item are required' }, { status: 400 })
    }

    const stripe = getStripe()

    const customer = await stripe.customers.create({
      name: clientName,
      email: clientEmail || undefined,
      metadata: { bario_client_key: clientKey },
    })

    // One shared "GST (Canada)" tax rate, reused across every external
    // client subscription rather than creating a duplicate Stripe object
    // per checkout.
    let taxRateId: string | undefined
    if (taxPercent > 0) {
      const existing = await stripe.taxRates.list({ limit: 100 })
      const found = existing.data.find((r) => r.display_name === 'GST (Canada)' && Number(r.percentage) === taxPercent && r.active)
      if (found) {
        taxRateId = found.id
      } else {
        const created = await stripe.taxRates.create({
          display_name: 'GST (Canada)',
          percentage: taxPercent,
          inclusive: false,
          country: 'CA',
        })
        taxRateId = created.id
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      line_items: lineItems.map((li) => ({
        price_data: {
          currency: 'cad',
          unit_amount: Math.round(li.unitAmountCents),
          recurring: { interval: 'month' },
          product_data: { name: li.name },
        },
        quantity: 1,
        tax_rates: taxRateId ? [taxRateId] : undefined,
      })),
      success_url: 'https://www.bario.ca/admin?subscription=success',
      cancel_url: 'https://www.bario.ca/admin?subscription=cancelled',
    })

    const id = randomUUID()
    await sql`
      INSERT INTO external_client_subscriptions (id, client_key, client_name, client_email, stripe_customer_id, stripe_checkout_session_id, status, line_items_json, tax_percent)
      VALUES (${id}, ${clientKey}, ${clientName}, ${clientEmail}, ${customer.id}, ${session.id}, 'pending_checkout', ${JSON.stringify(lineItems)}, ${taxPercent})
    `

    return NextResponse.json({ ok: true, id, stripeCustomerId: customer.id, checkoutUrl: session.url })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  const rows = (await sql`SELECT * FROM external_client_subscriptions ORDER BY created_at DESC`) as unknown as ExternalClientSubscription[]
  return NextResponse.json({ subscriptions: rows })
}
