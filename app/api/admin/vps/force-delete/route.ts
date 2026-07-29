import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { deleteServer } from '@/lib/hetzner'
import { getStripe } from '@/lib/stripe'
import { errorResponse } from '@/lib/errors'

// Manual deletion + subscription cancellation — the escape hatch for
// anything the reconciliation cron flags, or any other case needing a
// server gone right now regardless of its current status.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { instanceId } = await req.json()
    if (typeof instanceId !== 'string' || !instanceId.trim()) {
      return NextResponse.json({ error: 'instanceId is required' }, { status: 400 })
    }

    const rows = (await sql`
      SELECT id, hetzner_server_id, stripe_subscription_id FROM vps_instances WHERE id = ${instanceId}
    `) as unknown as { id: string; hetzner_server_id: string | null; stripe_subscription_id: string | null }[]
    const order = rows[0]
    if (!order) {
      await logAdminAction(sql, { action: 'vps-force-delete', params: { instanceId }, result: 'error', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
      return NextResponse.json({ error: 'No order found with that id' }, { status: 404 })
    }

    if (order.hetzner_server_id) await deleteServer(order.hetzner_server_id)
    if (order.stripe_subscription_id) {
      try {
        await getStripe().subscriptions.cancel(order.stripe_subscription_id)
      } catch {
        // Already canceled elsewhere (e.g. this IS the cancellation
        // webhook's own retry path) — not fatal, the server deletion above
        // already happened.
      }
    }

    await sql`UPDATE vps_instances SET status = 'deprovisioned', deprovisioned_at = now(), updated_at = now() WHERE id = ${instanceId}`

    await logAdminAction(sql, { action: 'vps-force-delete', params: { instanceId }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
