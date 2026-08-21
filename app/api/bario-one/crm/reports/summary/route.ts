import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// A separate, CRM-scoped summary from /api/bario-one/reports/summary
// (which is invoicing/COGS/expenses-only, gated on the 'invoicing' module
// and has zero deal/pipeline concepts). This one is gated on 'crm' and
// covers pipeline/sales-activity metrics instead.
//
// "Time to close" uses updated_at as a proxy for "when the deal was won" --
// bo_deals has no stage-history table, so an unrelated edit to a won deal
// after the fact would skew this. Documented rather than silently wrong.
export async function GET(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth

    const url = new URL(req.url)
    const now = new Date()
    const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const from = url.searchParams.get('from') || ymd(defaultFrom)
    const to = url.searchParams.get('to') || ymd(now)

    // Employees only see their own assigned records here too, matching
    // isRecordVisibleToMember's rule everywhere else in the CRM.
    const employeeScope = membership.role === 'employee'

    const stageBuckets = (await sql`
      SELECT stage, COUNT(*)::int AS count, COALESCE(SUM(value_cents), 0)::int AS value_cents
      FROM bo_deals
      WHERE organization_id = ${org.id}
        AND (NOT ${employeeScope} OR assigned_to_user_id IS NULL OR assigned_to_user_id = ${membership.user_id})
      GROUP BY stage
    `) as unknown as { stage: string; count: number; value_cents: number }[]

    const closedInRange = (await sql`
      SELECT stage, value_cents, created_at, updated_at, assigned_to_user_id
      FROM bo_deals
      WHERE organization_id = ${org.id}
        AND stage IN ('won', 'lost')
        AND updated_at::date >= ${from} AND updated_at::date <= ${to}
        AND (NOT ${employeeScope} OR assigned_to_user_id IS NULL OR assigned_to_user_id = ${membership.user_id})
    `) as unknown as { stage: string; value_cents: number; created_at: string; updated_at: string; assigned_to_user_id: string | null }[]

    const won = closedInRange.filter((d) => d.stage === 'won')
    const lost = closedInRange.filter((d) => d.stage === 'lost')
    const winRate = won.length + lost.length > 0 ? (won.length / (won.length + lost.length)) * 100 : 0
    const avgDealSizeCents = won.length > 0 ? Math.round(won.reduce((sum, d) => sum + d.value_cents, 0) / won.length) : 0
    const avgDaysToClose =
      won.length > 0
        ? Math.round(
            won.reduce((sum, d) => sum + (new Date(d.updated_at).getTime() - new Date(d.created_at).getTime()), 0) /
              won.length /
              (1000 * 60 * 60 * 24)
          )
        : 0

    const newCustomersRows = (await sql`
      SELECT COUNT(*)::int AS count FROM bo_customers
      WHERE organization_id = ${org.id}
        AND created_at::date >= ${from} AND created_at::date <= ${to}
        AND (NOT ${employeeScope} OR assigned_to_user_id IS NULL OR assigned_to_user_id = ${membership.user_id})
    `) as unknown as { count: number }[]

    const taskRows = (await sql`
      SELECT status FROM bo_tasks
      WHERE organization_id = ${org.id}
        AND due_at IS NOT NULL AND due_at::date >= ${from} AND due_at::date <= ${to}
        AND (NOT ${employeeScope} OR assigned_to_user_id IS NULL OR assigned_to_user_id = ${membership.user_id})
    `) as unknown as { status: string }[]
    const taskCompletionRate =
      taskRows.length > 0 ? (taskRows.filter((t) => t.status === 'done').length / taskRows.length) * 100 : 0

    // Per-rep breakdown -- owners/admins only, since an employee's scoped
    // view has nothing to compare against besides themselves.
    let byRep: { userId: string; email: string | null; wonCount: number; wonValueCents: number }[] = []
    if (!employeeScope) {
      const repRows = (await sql`
        SELECT d.assigned_to_user_id, u.email, COUNT(*)::int AS won_count, COALESCE(SUM(d.value_cents), 0)::int AS won_value_cents
        FROM bo_deals d
        LEFT JOIN users u ON u.id = d.assigned_to_user_id
        WHERE d.organization_id = ${org.id} AND d.stage = 'won'
          AND d.updated_at::date >= ${from} AND d.updated_at::date <= ${to}
          AND d.assigned_to_user_id IS NOT NULL
        GROUP BY d.assigned_to_user_id, u.email
        ORDER BY won_value_cents DESC
      `) as unknown as { assigned_to_user_id: string; email: string | null; won_count: number; won_value_cents: number }[]
      byRep = repRows.map((r) => ({ userId: r.assigned_to_user_id, email: r.email, wonCount: r.won_count, wonValueCents: r.won_value_cents }))
    }

    // Phase 9 (revenue attribution) — closes the loop on Phases 4/6's
    // source tagging (bo_customers.source: victoria_call/website_form/
    // dialer/scout/manual) by rolling won-deal revenue up by the channel
    // that originated the lead. Uses bo_deals.updated_at as the close date
    // (same documented proxy/limitation as avgDaysToClose above), and
    // counts every deal ever created for that source's customers, not just
    // ones closed in the date range, so a source's overall lead->revenue
    // conversion isn't sliced thin by an arbitrary window.
    const sourceRows = (await sql`
      SELECT
        COALESCE(c.source, 'manual') AS source,
        COUNT(DISTINCT c.id)::int AS lead_count,
        COUNT(*) FILTER (WHERE d.stage = 'won')::int AS won_count,
        COUNT(*) FILTER (WHERE d.stage = 'lost')::int AS lost_count,
        COALESCE(SUM(d.value_cents) FILTER (WHERE d.stage = 'won'), 0)::int AS won_value_cents
      FROM bo_customers c
      LEFT JOIN bo_deals d ON d.customer_id = c.id AND d.organization_id = ${org.id}
      WHERE c.organization_id = ${org.id}
        AND (NOT ${employeeScope} OR c.assigned_to_user_id IS NULL OR c.assigned_to_user_id = ${membership.user_id})
      GROUP BY COALESCE(c.source, 'manual')
      ORDER BY won_value_cents DESC
    `) as unknown as { source: string; lead_count: number; won_count: number; lost_count: number; won_value_cents: number }[]
    const bySource = sourceRows.map((r) => ({
      ...r,
      winRate: r.won_count + r.lost_count > 0 ? (r.won_count / (r.won_count + r.lost_count)) * 100 : 0,
    }))

    return NextResponse.json({
      from,
      to,
      stageBuckets,
      wonCount: won.length,
      lostCount: lost.length,
      winRate,
      avgDealSizeCents,
      avgDaysToClose,
      newCustomersCount: newCustomersRows[0]?.count ?? 0,
      taskCompletionRate,
      taskCount: taskRows.length,
      byRep,
      bySource,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
