import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

// Every number here comes from a real query. Spott's API doesn't expose
// page views/click-through/conversion (there's no such endpoint on their
// side today) — the response says so explicitly rather than omitting the
// field or faking a number, so the page can render "Not available"
// instead of silently dropping a metric.
export async function GET() {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const [listingRows, leadStats, reviewStats, promoStats] = await Promise.all([
      sql`SELECT sync_status, last_synced_at FROM spott_listings WHERE organization_id = ${org.id} AND sync_status != 'not_connected' LIMIT 1`,
      sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS last_30_days FROM spott_leads WHERE organization_id = ${org.id}`,
      sql`SELECT count(*)::int AS total, avg(rating)::float AS avg_rating, count(*) FILTER (WHERE owner_reply IS NOT NULL)::int AS replied FROM spott_reviews WHERE organization_id = ${org.id}`,
      sql`SELECT count(*) FILTER (WHERE status = 'active')::int AS active, count(*)::int AS total FROM spott_promotions WHERE organization_id = ${org.id}`,
    ]) as unknown as [any[], any[], any[], any[]]

    return NextResponse.json({
      connection: listingRows[0] ?? null,
      leads: { total: leadStats[0]?.total ?? 0, last_30_days: leadStats[0]?.last_30_days ?? 0 },
      reviews: {
        total: reviewStats[0]?.total ?? 0,
        avg_rating: reviewStats[0]?.avg_rating ?? null,
        replied: reviewStats[0]?.replied ?? 0,
      },
      promotions: { active: promoStats[0]?.active ?? 0, total: promoStats[0]?.total ?? 0 },
      not_available: ['page_views', 'click_through_rate', 'conversion_rate'],
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
