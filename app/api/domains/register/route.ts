import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User } from '@/lib/db'
import { hasPaidPlan } from '@/lib/access'
import { getTldPricing, type RegistrantContact } from '@/lib/registrar'
import { retailPrice } from '@/lib/domainPricing'
import { getStripe } from '@/lib/stripe'
import { errorResponse } from '@/lib/errors'

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/
const REQUIRED_CONTACT_FIELDS: (keyof RegistrantContact)[] = [
  'firstName', 'lastName', 'address1', 'city', 'stateProvince', 'postalCode', 'country', 'phone', 'emailAddress',
]

// Temporarily held: the registrar backend is still pointed at Namecheap's
// sandbox (see [[bario_domain_reseller]]), and Stripe is in live mode — a
// real customer could be really charged for a domain that never actually
// registers. Blocked here at the API level (not just hidden in the UI) so
// this can never be reached by calling the route directly either. Remove
// once the registrar proxy is switched to production Namecheap credentials
// and a real end-to-end purchase has been verified.
const DOMAIN_PURCHASE_ON_HOLD = true

// Starts a domain purchase — creates a pending order and a real Stripe
// Checkout session. The domain is NOT registered here; that only happens
// once Stripe confirms payment (app/api/webhooks/stripe/route.ts), so a
// customer can never end up charged-but-not-registered or registered-for-
// free. Currently pointed at Namecheap's sandbox — see [[bario_domain_reseller]].
export async function POST(req: Request) {
  if (DOMAIN_PURCHASE_ON_HOLD) {
    return NextResponse.json(
      { error: "Domain registration is temporarily unavailable while we finish setting up our registrar. We're working on it and it'll be back very soon — sorry for the inconvenience!" },
      { status: 503 }
    )
  }

  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
    const user = userRows[0]
    if (!user || !hasPaidPlan(user)) {
      return NextResponse.json({ error: 'Upgrade to a paid plan to register a domain' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const domain = String(body?.domain ?? '').trim().toLowerCase()
    const years = Number(body?.years ?? 1)
    const contact = body?.contact ?? {}
    const siteId = typeof body?.siteId === 'string' ? body.siteId : null

    if (!DOMAIN_RE.test(domain)) return NextResponse.json({ error: 'Enter a valid domain name' }, { status: 400 })
    if (years !== 1) return NextResponse.json({ error: 'Only 1-year registration is supported right now' }, { status: 400 })
    for (const f of REQUIRED_CONTACT_FIELDS) {
      if (!contact[f] || typeof contact[f] !== 'string') {
        return NextResponse.json({ error: `contact.${f} is required` }, { status: 400 })
      }
    }

    if (siteId) {
      const siteRows = (await sql`SELECT id, user_id FROM sites WHERE id = ${siteId}`) as unknown as { id: string; user_id: string }[]
      if (!siteRows[0] || siteRows[0].user_id !== session.userId) {
        return NextResponse.json({ error: 'Site not found' }, { status: 404 })
      }
    }

    const tld = domain.split('.').slice(1).join('.')
    const wholesale = await getTldPricing(tld)
    const retail = retailPrice(wholesale.registrationPrice + wholesale.additionalCost)
    const retailCents = Math.round(retail * 100)

    const id = randomUUID()
    await sql`
      INSERT INTO domain_orders (id, user_id, site_id, domain, years, status, environment, contact_json, retail_price_cents)
      VALUES (${id}, ${session.userId}, ${siteId}, ${domain}, ${years}, 'pending_payment', ${process.env.NAMECHEAP_ENVIRONMENT ?? 'sandbox'}, ${JSON.stringify(contact)}, ${retailCents})
    `

    const origin = req.headers.get('origin') ?? 'https://bario.ca'
    const checkoutSession = await getStripe().checkout.sessions.create({
      mode: 'payment',
      customer_email: user.email,
      client_reference_id: user.id,
      metadata: { userId: user.id, domainOrderId: id },
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: retailCents,
          product_data: { name: `Domain registration: ${domain} (1 year)` },
        },
        quantity: 1,
      }],
      success_url: `${origin}/dashboard/domains?purchased=1&orderId=${id}`,
      cancel_url: `${origin}/dashboard/domains`,
    })

    return NextResponse.json({ ok: true, url: checkoutSession.url })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const sql = await db()
    const orders = await sql`
      SELECT id, domain, years, status, charged_amount, retail_price_cents, environment, connected_to_site, created_at
      FROM domain_orders WHERE user_id = ${session.userId} ORDER BY created_at DESC
    `
    return NextResponse.json({ ok: true, orders })
  } catch (err: any) {
    return errorResponse(err)
  }
}
