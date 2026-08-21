import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getStripe } from '@/lib/stripe'
import { errorResponse } from '@/lib/errors'

// One-off diagnostic: confirms whether STRIPE_SECRET_KEY (the one and only
// key getStripe() ever uses -- no test/live branching exists in the code)
// is actually a live or test-mode key. Stripe's balance.retrieve() response
// includes `livemode` regardless of which kind of key made the request, so
// this is authoritative -- unlike guessing from what mode a human's own
// dashboard tab happens to be showing.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const stripe = getStripe()
    const balance = await stripe.balance.retrieve()

    const lookupId = new URL(req.url).searchParams.get('paymentIntent')
    let lookedUp: any = undefined
    let lookupError: string | undefined
    // The ID shown in a Balance/Payouts report's "Description" column isn't
    // always a pi_/ch_-prefixed ID the SDK's typed retrieve methods expect
    // (Stripe's newer unified Payment object uses py_) -- try the common
    // resource types in turn rather than assume one.
    if (lookupId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(lookupId, { expand: ['latest_charge', 'customer'] })
        lookedUp = { via: 'paymentIntent', id: pi.id, amount: pi.amount, currency: pi.currency, status: pi.status, description: pi.description, metadata: pi.metadata, customerEmail: (pi.customer as any)?.email, receiptEmail: pi.receipt_email, created: new Date(pi.created * 1000).toISOString() }
      } catch (e1: any) {
        try {
          const ch = await stripe.charges.retrieve(lookupId, { expand: ['customer'] })
          lookedUp = { via: 'charge', id: ch.id, amount: ch.amount, currency: ch.currency, status: ch.status, description: ch.description, metadata: ch.metadata, customerEmail: (ch.customer as any)?.email, receiptEmail: ch.receipt_email, created: new Date(ch.created * 1000).toISOString() }
        } catch (e2: any) {
          lookupError = `paymentIntent: ${e1.message} | charge: ${e2.message}`
        }
      }
    }

    let account: any = undefined
    if (new URL(req.url).searchParams.get('account') === 'true') {
      // GET /v1/account (singular, no ID) is "the account for this API key" --
      // distinct from GET /v1/accounts/:id (Connect, plural). The typed SDK
      // method for this varies across major versions enough that it's more
      // reliable to just hit the REST endpoint directly with the same key.
      const res = await fetch('https://api.stripe.com/v1/account', {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      })
      const acct = await res.json()
      account = {
        id: acct.id,
        businessProfileName: acct.business_profile?.name,
        settingsDashboardDisplayName: acct.settings?.dashboard?.display_name,
        detailsSubmitted: acct.details_submitted,
        chargesEnabled: acct.charges_enabled,
        requirementsCurrentlyDue: acct.requirements?.currently_due,
        requirementsPendingVerification: acct.requirements?.pending_verification,
      }
    }

    let fix: any = undefined
    if (new URL(req.url).searchParams.get('fixBusinessName') === 'true') {
      // "Barip.ca" was a real typo in business_profile.name (the dashboard's
      // own account switcher shows this field, bold, above the correct
      // settings.dashboard.display_name "Bario.ca" underneath it) that the
      // dashboard UI wasn't letting the user edit. Trying via the API
      // directly -- if Stripe rejects this too, that confirms it's a real
      // account-level lock, not just a dashboard bug.
      const res = await fetch('https://api.stripe.com/v1/account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ 'business_profile[name]': 'Bario.ca' }),
      })
      const data = await res.json()
      fix = res.ok
        ? { ok: true, newBusinessProfileName: data.business_profile?.name }
        : { ok: false, error: data.error?.message, code: data.error?.code, type: data.error?.type }
    }

    let paymentLinkStatus: any = undefined
    if (new URL(req.url).searchParams.get('checkPaymentLinks') === 'true') {
      // Match the two known Bario Voice reconnection links by URL (their
      // buy.stripe.com slug isn't the same as the plink_ id, so list +
      // filter rather than guess), then list each link's real Checkout
      // Sessions to see if any actually completed -- this is the
      // authoritative "did they pay" answer, not a DB lookup (these
      // charges were never tracked in a bo_invoices row to begin with).
      const targets: Record<string, string> = {
        afc: 'https://buy.stripe.com/fZu28lcWI0l48p7cZjdUY00',
        sunbuilt: 'https://buy.stripe.com/4gMfZb7Co3xg5cV2kFdUY01',
      }
      const links = await stripe.paymentLinks.list({ limit: 100 })
      paymentLinkStatus = {}
      for (const [key, url] of Object.entries(targets)) {
        const link = links.data.find((l) => l.url === url)
        if (!link) {
          paymentLinkStatus[key] = { error: `No payment link found matching ${url}` }
          continue
        }
        const sessions = await stripe.checkout.sessions.list({ payment_link: link.id, limit: 20 })
        const paid = sessions.data.filter((s) => s.payment_status === 'paid')
        paymentLinkStatus[key] = {
          linkId: link.id,
          totalSessions: sessions.data.length,
          paidCount: paid.length,
          paid: paid.map((s) => ({ id: s.id, amountTotal: s.amount_total, currency: s.currency, customerEmail: s.customer_details?.email, created: new Date(s.created * 1000).toISOString() })),
          allSessions: sessions.data.map((s) => ({ id: s.id, status: s.status, payment_status: s.payment_status, created: new Date(s.created * 1000).toISOString(), expiresAt: s.expires_at ? new Date(s.expires_at * 1000).toISOString() : null })),
        }
      }
    }

    return NextResponse.json({ ok: true, livemode: balance.livemode, lookedUp, lookupError, account, fix, paymentLinkStatus })
  } catch (err: any) {
    return errorResponse(err)
  }
}
