import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

const PAGE_SIZE = 100

// The site audit is deliberately gated behind a free account (see
// components/SiteAudit.tsx / app/api/site-audit) specifically so it doubles
// as a lead source: every signup through that funnel is a real business
// owner who cared enough about their site to hand over an email and the
// URL they want fixed. This route surfaces that list for outreach instead
// of leaving it buried in the plain users table. One row per audit (not
// deduped per user) — a lead who audited 3 sites is 3 real data points
// worth having, not noise.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
    const offset = (page - 1) * PAGE_SIZE

    const countRows = (await sql`SELECT count(*)::int AS count FROM site_audits`) as unknown as { count: number }[]
    const total = countRows[0]?.count ?? 0

    const summaryRows = (await sql`
      SELECT
        count(DISTINCT sa.user_id)::int AS unique_leads,
        count(*)::int AS total_audits,
        count(*) FILTER (WHERE sa.ai_report_json IS NOT NULL)::int AS unlocked_count
      FROM site_audits sa
    `) as unknown as { unique_leads: number; total_audits: number; unlocked_count: number }[]

    const rows = await sql`
      SELECT
        sa.id, sa.url, sa.status, sa.credits_charged, sa.created_at,
        (sa.ai_report_json IS NOT NULL) AS unlocked,
        CASE WHEN sa.ai_report_json IS NOT NULL THEN (sa.ai_report_json::json->>'score')::int ELSE NULL END AS score,
        u.id AS user_id, u.email, u.plan, u.email_verified, u.is_admin, u.created_at AS user_created_at
      FROM site_audits sa
      JOIN users u ON u.id = sa.user_id
      ORDER BY sa.created_at DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `

    return NextResponse.json({
      ok: true,
      leads: rows,
      total,
      page,
      pageSize: PAGE_SIZE,
      summary: summaryRows[0] ?? { unique_leads: 0, total_audits: 0, unlocked_count: 0 },
    })
  } catch (err) {
    return errorResponse(err)
  }
}
