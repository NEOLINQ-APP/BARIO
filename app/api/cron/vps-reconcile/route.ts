import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { listServers, deleteServer } from '@/lib/hetzner'
import { logAdminAction } from '@/lib/adminActions'

// This repo deliberately avoids cron everywhere else (lazy credits refill,
// opportunistic rate-limit cleanup) because staleness there is free. VPS
// billing drift isn't: every hour a Hetzner server keeps running against a
// subscription Stripe already canceled (a missed/delayed webhook — Stripe
// documents this as possible) is a real invoice with no revenue behind it.
// This is the one deliberate exception to that convention, run every 6
// hours via vercel.json — see the approved VPS plan for the full reasoning.
export const maxDuration = 60

export async function GET(req: Request) {
  // Accepts Vercel's own cron-injected secret OR the admin API key — the
  // latter isn't strictly required for the scheduled trigger to work, but
  // lets an admin manually kick off reconciliation on demand rather than
  // waiting up to 6 hours, same dual-auth spirit as requireAdmin elsewhere.
  const authHeader = req.headers.get('authorization')
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isAdminKey = process.env.BARIO_ADMIN_API_KEY && authHeader === `Bearer ${process.env.BARIO_ADMIN_API_KEY}`
  if (!isCron && !isAdminKey) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const sql = await db()
  const report: { retriedDeletions: string[]; orphansFlagged: string[]; suspendedSwept: string[]; errors: string[] } = {
    retriedDeletions: [],
    orphansFlagged: [],
    suspendedSwept: [],
    errors: [],
  }

  try {
    const liveServers = await listServers('bario_managed=true')
    const liveServerIds = new Set(liveServers.map((s) => String(s.id)))

    // 1. A deletion that failed inline (webhook's own delete attempt threw)
    // is left in canceled_pending_deprovision — retry it here.
    const pendingDeletions = (await sql`
      SELECT id, hetzner_server_id FROM vps_instances WHERE status = 'canceled_pending_deprovision'
    `) as unknown as { id: string; hetzner_server_id: string | null }[]
    for (const row of pendingDeletions) {
      try {
        if (row.hetzner_server_id) await deleteServer(row.hetzner_server_id)
        await sql`UPDATE vps_instances SET status = 'deprovisioned', deprovisioned_at = now(), updated_at = now() WHERE id = ${row.id}`
        report.retriedDeletions.push(row.id)
      } catch (err: any) {
        report.errors.push(`retry-delete ${row.id}: ${err.message}`)
      }
    }

    // 2. A live Hetzner server with no matching active DB row is an orphan —
    // flagged for a human look, never auto-deleted (an unexplained orphan
    // deserves a look before losing data, not a silent guess).
    const activeRows = (await sql`
      SELECT hetzner_server_id FROM vps_instances WHERE status IN ('active', 'suspended', 'past_due', 'provisioning')
    `) as unknown as { hetzner_server_id: string | null }[]
    const activeServerIds = new Set(activeRows.map((r) => r.hetzner_server_id).filter(Boolean))
    for (const serverId of Array.from(liveServerIds)) {
      if (!activeServerIds.has(serverId)) {
        report.orphansFlagged.push(serverId)
      }
    }
    if (report.orphansFlagged.length > 0) {
      await logAdminAction(sql, {
        action: 'vps-reconcile-orphans-detected',
        params: { serverIds: report.orphansFlagged },
        result: 'ok',
        triggeredBy: 'ai_autonomous',
      })
    }

    // 3. Suspended past a 7-day grace window — the customer had a real
    // window to pay and resume; now actually reclaim the resource.
    const staleSuspended = (await sql`
      SELECT id, hetzner_server_id FROM vps_instances
      WHERE status = 'suspended' AND suspended_at < now() - interval '7 days'
    `) as unknown as { id: string; hetzner_server_id: string | null }[]
    for (const row of staleSuspended) {
      try {
        if (row.hetzner_server_id) await deleteServer(row.hetzner_server_id)
        await sql`UPDATE vps_instances SET status = 'deprovisioned', deprovisioned_at = now(), updated_at = now() WHERE id = ${row.id}`
        report.suspendedSwept.push(row.id)
      } catch (err: any) {
        report.errors.push(`sweep-suspended ${row.id}: ${err.message}`)
      }
    }

    if (report.retriedDeletions.length || report.suspendedSwept.length || report.errors.length) {
      await logAdminAction(sql, { action: 'vps-reconcile-run', params: report, result: report.errors.length ? 'error' : 'ok', triggeredBy: 'ai_autonomous' })
    }

    return NextResponse.json({ ok: true, ...report })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, ...report }, { status: 500 })
  }
}
