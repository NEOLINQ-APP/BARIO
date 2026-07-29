import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { provisionVpsInstance } from '@/lib/vpsProvision'
import { errorResponse } from '@/lib/errors'

// Moves a risk-flagged pending_review order into provisioning. Unlike the
// webhook's own provisioning call, errors here are NOT swallowed — the
// admin making this call should see exactly what went wrong.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { instanceId } = await req.json()
    if (typeof instanceId !== 'string' || !instanceId.trim()) {
      return NextResponse.json({ error: 'instanceId is required' }, { status: 400 })
    }

    const rows = (await sql`SELECT id FROM vps_instances WHERE id = ${instanceId} AND status = 'pending_review'`) as unknown as { id: string }[]
    if (!rows[0]) {
      await logAdminAction(sql, { action: 'vps-approve', params: { instanceId }, result: 'error', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
      return NextResponse.json({ error: 'No pending_review order found with that id' }, { status: 404 })
    }

    await sql`UPDATE vps_instances SET status = 'awaiting_provision', risk_flag = 'none', updated_at = now() WHERE id = ${instanceId}`
    await provisionVpsInstance(sql, instanceId)

    await logAdminAction(sql, { action: 'vps-approve', params: { instanceId }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
