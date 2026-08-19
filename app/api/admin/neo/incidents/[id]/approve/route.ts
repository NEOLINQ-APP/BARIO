import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { executeAdminAssistantTool } from '@/lib/adminAssistantTools'
import { errorResponse } from '@/lib/errors'

// The only place a 'pending_approval' incident's proposed fix actually
// runs — requires an explicit admin click (session or Bearer, same as
// every other admin route), never fires on its own. Reuses
// executeAdminAssistantTool so the fix goes through the exact same
// validated, audit-logged path a human asking NEO in chat would use.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`
      SELECT * FROM neo_incidents WHERE id = ${params.id} AND status = 'pending_approval'
    `) as unknown as { id: string; category: string; description: string; proposed_tool: string | null; proposed_args_json: string | null }[]
    const incident = rows[0]
    if (!incident) return NextResponse.json({ error: 'No pending approval found for that id' }, { status: 404 })
    if (!incident.proposed_tool) return NextResponse.json({ error: 'This incident has no proposed action recorded' }, { status: 400 })

    const args = JSON.parse(incident.proposed_args_json || '{}')
    const result = await executeAdminAssistantTool(sql, incident.proposed_tool, args)
    const resultText = typeof result === 'object' ? JSON.stringify(result) : String(result)

    await sql`
      UPDATE neo_incidents
      SET status = 'auto_fixed', action_taken = ${`Approved by admin — ${incident.proposed_tool}: ${resultText}`}, resolved_at = now()
      WHERE id = ${incident.id}
    `

    return NextResponse.json({ ok: true, result })
  } catch (err) {
    return errorResponse(err)
  }
}
