import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { provisionVpsInstance } from '@/lib/vpsProvision'
import { errorResponse } from '@/lib/errors'

// Re-runs provisioning on a row that previously failed. Resets it to
// awaiting_provision first since provisionVpsInstance's own idempotency
// guard only proceeds from that exact status.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { instanceId } = await req.json()
    if (typeof instanceId !== 'string' || !instanceId.trim()) {
      return NextResponse.json({ error: 'instanceId is required' }, { status: 400 })
    }

    const rows = (await sql`SELECT id FROM vps_instances WHERE id = ${instanceId} AND status = 'provision_failed'`) as unknown as { id: string }[]
    if (!rows[0]) {
      await logAdminAction(sql, { action: 'vps-retry-provision', params: { instanceId }, result: 'error', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
      return NextResponse.json({ error: 'No provision_failed order found with that id' }, { status: 404 })
    }

    await sql`UPDATE vps_instances SET status = 'awaiting_provision', last_error = NULL, updated_at = now() WHERE id = ${instanceId}`
    await provisionVpsInstance(sql, instanceId)

    await logAdminAction(sql, { action: 'vps-retry-provision', params: { instanceId }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
