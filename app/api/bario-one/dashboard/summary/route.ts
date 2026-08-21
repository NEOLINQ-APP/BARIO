import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

// Business OS Step 11 — real queries only, every metric. Genuinely-empty
// data (Spott Leads, Marketing Leads today) renders as 0, never
// fabricated. Base-level like the Dashboard nav item itself — not gated
// on any one module, since it should render something honest regardless
// of which modules an org has enabled.
export async function GET() {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const [revenueRows, newLeadsRows, customersRows, appointmentsRows, openDealsRows, spottLeadsRows, marketingLeadsRows, wonLostRows] = await Promise.all([
      sql`SELECT COALESCE(SUM(total_cents), 0)::int AS total FROM (
        SELECT (SELECT COALESCE(SUM(quantity * unit_price_cents), 0) FROM bo_invoice_items WHERE invoice_id = i.id) AS total_cents
        FROM bo_invoices i WHERE i.organization_id = ${org.id} AND i.type = 'invoice' AND i.status = 'paid'
      ) t`,
      sql`SELECT COUNT(*)::int AS n FROM bo_customers WHERE organization_id = ${org.id} AND created_at >= ${monthStart.toISOString()}`,
      sql`SELECT COUNT(*)::int AS n FROM bo_customers WHERE organization_id = ${org.id} AND lifecycle_stage = 'customer'`,
      sql`SELECT COUNT(*)::int AS n FROM bo_appointments WHERE organization_id = ${org.id} AND status = 'scheduled' AND starts_at >= now()`,
      sql`SELECT COUNT(*)::int AS n FROM bo_deals WHERE organization_id = ${org.id} AND stage NOT IN ('won', 'lost')`,
      sql`SELECT COUNT(*)::int AS n FROM spott_leads WHERE organization_id = ${org.id}`,
      // Business OS Step 8 — real, honest reading of the attribution
      // model: a "marketing lead" is one whose lead_sources.source is a
      // marketing channel, not organic/manual/direct/ai/spott. Will be 0
      // or near-0 today since recordLeadSource() isn't backfilled or
      // wired into every existing creation path yet — that's the honest
      // answer, not a bug.
      sql`
        SELECT COUNT(DISTINCT ls.customer_id)::int AS n
        FROM lead_sources ls JOIN bo_customers c ON c.id = ls.customer_id
        WHERE c.organization_id = ${org.id} AND ls.source IN ('website', 'landing_page', 'email', 'sms', 'referral', 'qr_code', 'google', 'facebook', 'instagram')
      `,
      sql`SELECT stage, COUNT(*)::int AS n FROM bo_deals WHERE organization_id = ${org.id} AND stage IN ('won', 'lost') GROUP BY stage`,
    ])

    const won = (wonLostRows as any[]).find((r) => r.stage === 'won')?.n ?? 0
    const lost = (wonLostRows as any[]).find((r) => r.stage === 'lost')?.n ?? 0
    const conversionRate = won + lost > 0 ? (won / (won + lost)) * 100 : 0

    return NextResponse.json({
      revenueCents: (revenueRows as any[])[0]?.total ?? 0,
      newLeads: (newLeadsRows as any[])[0]?.n ?? 0,
      customers: (customersRows as any[])[0]?.n ?? 0,
      upcomingAppointments: (appointmentsRows as any[])[0]?.n ?? 0,
      openDeals: (openDealsRows as any[])[0]?.n ?? 0,
      spottLeads: (spottLeadsRows as any[])[0]?.n ?? 0,
      marketingLeads: (marketingLeadsRows as any[])[0]?.n ?? 0,
      conversionRate,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
