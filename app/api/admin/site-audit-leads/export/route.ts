import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { toCsv } from '@/lib/csv'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`
      SELECT
        u.email, u.plan, u.email_verified, sa.url, sa.created_at,
        (sa.ai_report_json IS NOT NULL) AS unlocked,
        CASE WHEN sa.ai_report_json IS NOT NULL THEN (sa.ai_report_json::json->>'score')::int ELSE NULL END AS score
      FROM site_audits sa
      JOIN users u ON u.id = sa.user_id
      ORDER BY sa.created_at DESC
    `) as unknown as { email: string; plan: string; email_verified: boolean; url: string; created_at: string; unlocked: boolean; score: number | null }[]

    const csv = toCsv(rows, [
      { key: 'email', header: 'Email' },
      { key: 'plan', header: 'Plan' },
      { key: 'email_verified', header: 'Email Verified' },
      { key: 'url', header: 'Site Audited' },
      { key: 'score', header: 'AI Report Score' },
      { key: 'unlocked', header: 'Unlocked Deep Report' },
      { key: 'created_at', header: 'Audit Date' },
    ])

    return new NextResponse(csv, {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="site-audit-leads.csv"' },
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
