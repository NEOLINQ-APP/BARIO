import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { isVpsTierKey, isBillingCycle, VPS_REGION } from '@/lib/vpsTiers'
import { provisionVpsInstance } from '@/lib/vpsProvision'
import { errorResponse } from '@/lib/errors'

// Admin-comped VPS — same purpose as grant-plan/grant-storage: hand a
// customer a server without a real Stripe payment behind it (support cases,
// promo/testing). Skips pending_payment/pending_review entirely and
// provisions immediately, since there's no payment or risk signal to wait
// on for an order the admin is creating directly.
export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const { email, tier, billingCycle, region, backupAddon, sshPublicKey, appType } = await req.json()

    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    if (!isVpsTierKey(tier)) {
      return NextResponse.json({ error: 'tier must be one of: small, medium, large' }, { status: 400 })
    }
    const cycle = isBillingCycle(billingCycle) ? billingCycle : 'monthly'
    const resolvedAppType = appType === 'wordpress' ? 'wordpress' : 'blank'

    const userRows = (await sql`SELECT id FROM users WHERE email = ${email.trim().toLowerCase()}`) as unknown as { id: string }[]
    const targetUser = userRows[0]
    if (!targetUser) {
      await logAdminAction(sql, { action: 'vps-create', targetEmail: email, result: 'error', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
      return NextResponse.json({ error: `No account found for ${email}` }, { status: 404 })
    }

    const instanceId = randomUUID()
    await sql`
      INSERT INTO vps_instances (id, user_id, tier, billing_cycle, app_type, region, ssh_public_key, backup_addon, status)
      VALUES (${instanceId}, ${targetUser.id}, ${tier}, ${cycle}, ${resolvedAppType}, ${region || VPS_REGION}, ${sshPublicKey || null}, ${!!backupAddon}, 'awaiting_provision')
    `

    await provisionVpsInstance(sql, instanceId)

    const rows = (await sql`SELECT * FROM vps_instances WHERE id = ${instanceId}`) as unknown as any[]

    await logAdminAction(sql, { action: 'vps-create', targetEmail: email, params: { tier, instanceId }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true, instance: rows[0] })
  } catch (err: any) {
    return errorResponse(err)
  }
}
