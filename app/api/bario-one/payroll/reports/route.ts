import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

// One row per pay run with aggregated totals across its stubs — the
// "payroll reports" view. Real SQL aggregation, not fetched-then-summed
// in JS, since this is exactly the kind of report a business owner needs
// to hand to a bookkeeper.
export async function GET() {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`
      SELECT
        r.id, r.frequency, r.pay_period_start, r.pay_period_end, r.pay_date, r.status,
        COUNT(s.id)::int as employee_count,
        COALESCE(SUM(s.gross_cents), 0)::bigint as total_gross_cents,
        COALESCE(SUM(s.federal_tax_cents + s.provincial_tax_cents), 0)::bigint as total_tax_cents,
        COALESCE(SUM(s.cpp_or_qpp_cents), 0)::bigint as total_cpp_cents,
        COALESCE(SUM(s.ei_cents + s.qpip_cents), 0)::bigint as total_ei_cents,
        COALESCE(SUM(s.net_pay_cents), 0)::bigint as total_net_cents
      FROM bo_pay_runs r
      LEFT JOIN bo_pay_stubs s ON s.pay_run_id = r.id
      WHERE r.organization_id = ${org.id}
      GROUP BY r.id
      ORDER BY r.pay_period_start DESC
    `) as unknown as any[]

    return NextResponse.json({ report: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}
