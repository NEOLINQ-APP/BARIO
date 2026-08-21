import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

// Business OS Steps 3-15 (Automations > Runs) — bo_automation_runs has
// real data already (every automation firing writes one row, since
// lib/barioOneAutomations.ts's runAutomations()), just never surfaced in
// any UI before this. Read-only, joins through bo_automations for the
// org scope since runs don't carry organization_id directly.
export async function GET(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = await sql`
      SELECT r.id, r.context_json, r.success, r.error, r.created_at, a.name AS automation_name, a.trigger_event, a.action_type
      FROM bo_automation_runs r
      JOIN bo_automations a ON a.id = r.automation_id
      WHERE a.organization_id = ${org.id}
      ORDER BY r.created_at DESC
      LIMIT 100
    `
    return NextResponse.json({ runs: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}
