import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { provisionWpSharedSite } from '@/lib/wpSharedProvision'
import { errorResponse } from '@/lib/errors'

// Mirrors app/api/admin/vps/retry-provision/route.ts exactly — resets a
// failed or capacity-blocked order back to 'awaiting_provision' and
// re-invokes the same idempotent provisioning function the webhook uses.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const rows = await sql`
      UPDATE wp_sites SET status = 'awaiting_provision', last_error = NULL, updated_at = now()
      WHERE id = ${params.id} AND status IN ('provision_failed', 'awaiting_capacity')
      RETURNING id
    `
    if (!rows[0]) return NextResponse.json({ error: 'Site not found, or not in a retryable state' }, { status: 400 })

    await provisionWpSharedSite(sql, params.id)

    await logAdminAction(sql, { action: 'wp-hosting-site-retry-provision', params: { id: params.id }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
