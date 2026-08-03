import { getStripe } from '@/lib/stripe'

// Pulls the sales record straight from Stripe rather than maintaining a
// separate internal ledger table — Stripe checkout sessions already are the
// authoritative record of every purchase across every Bario product
// (hosting plans, VPS, domains, templates, X-Drive storage), each already
// tagged with distinguishing metadata at creation time (see
// app/api/checkout, app/api/vps/checkout, app/api/domains/register,
// app/api/templates/[id]/purchase, app/api/media/checkout). Classifying by
// metadata key here, rather than by product name string, since metadata
// shape is stable and deliberate while display names could be edited later.
export type SaleRecord = {
  id: string
  createdAt: string
  customerEmail: string | null
  product: string
  mode: 'payment' | 'subscription'
  amountTotal: number // in the currency's smallest unit (cents)
  currency: string
  status: string
}

function classifyProduct(metadata: Record<string, string>, mode: string): string {
  if (metadata.domainOrderId) return 'Domain registration'
  if (metadata.templateId) return 'Template'
  if (metadata.storageTier) return `X-Drive storage (${metadata.storageTier})`
  if (metadata.vpsOrderId) return 'VPS'
  if (metadata.plan) return `Hosting plan (${metadata.plan})`
  return mode === 'subscription' ? 'Subscription (other)' : 'One-time purchase (other)'
}

export async function listSales(opts: { limit?: number; startingAfter?: string } = {}): Promise<{ sales: SaleRecord[]; hasMore: boolean; nextCursor: string | null }> {
  const stripe = getStripe()
  const page = await stripe.checkout.sessions.list({
    limit: opts.limit ?? 50,
    starting_after: opts.startingAfter,
    status: 'complete',
  })

  const sales: SaleRecord[] = page.data
    .filter((s) => s.payment_status === 'paid' || s.payment_status === 'no_payment_required')
    .map((s) => ({
      id: s.id,
      createdAt: new Date(s.created * 1000).toISOString(),
      customerEmail: s.customer_details?.email ?? s.customer_email ?? null,
      product: classifyProduct((s.metadata ?? {}) as Record<string, string>, s.mode),
      mode: s.mode as 'payment' | 'subscription',
      amountTotal: s.amount_total ?? 0,
      currency: (s.currency ?? 'usd').toUpperCase(),
      status: s.payment_status,
    }))

  return {
    sales,
    hasMore: page.has_more,
    nextCursor: page.data.length ? page.data[page.data.length - 1].id : null,
  }
}

export async function salesSummary(): Promise<{ totalRevenueCents: number; countByProduct: Record<string, { count: number; revenueCents: number }>; currency: string }> {
  const stripe = getStripe()
  let totalRevenueCents = 0
  const countByProduct: Record<string, { count: number; revenueCents: number }> = {}
  let currency = 'USD'

  // Walks the full paid-session history — bounded to a generous but finite
  // number of pages so a runaway Stripe account can't turn this into an
  // unbounded loop; revisit with real date-range filtering if sales volume
  // ever approaches this ceiling.
  let cursor: string | undefined
  for (let page = 0; page < 40; page++) {
    const result = await stripe.checkout.sessions.list({ limit: 100, starting_after: cursor, status: 'complete' })
    for (const s of result.data) {
      if (s.payment_status !== 'paid' && s.payment_status !== 'no_payment_required') continue
      const product = classifyProduct((s.metadata ?? {}) as Record<string, string>, s.mode)
      const amount = s.amount_total ?? 0
      totalRevenueCents += amount
      currency = (s.currency ?? currency).toUpperCase()
      if (!countByProduct[product]) countByProduct[product] = { count: 0, revenueCents: 0 }
      countByProduct[product].count++
      countByProduct[product].revenueCents += amount
    }
    if (!result.has_more || !result.data.length) break
    cursor = result.data[result.data.length - 1].id
  }

  return { totalRevenueCents, countByProduct, currency }
}
