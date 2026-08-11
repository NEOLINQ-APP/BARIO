import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import type { BoAutomationRun } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const owned = (await sql`SELECT id FROM bo_automations WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown[]
    if (owned.length === 0) return NextResponse.json({ error: 'Automation not found' }, { status: 404 })

    const runs = (await sql`
      SELECT * FROM bo_automation_runs WHERE automation_id = ${params.id} ORDER BY created_at DESC LIMIT 20
    `) as unknown as BoAutomationRun[]

    return NextResponse.json({ runs: runs.map((r) => ({ ...r, context: JSON.parse(r.context_json) })) })
  } catch (err: any) {
    return errorResponse(err)
  }
}
