import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveStudioJob, type StudioJobRow } from '@/lib/studioJobs'
import { logAdminAction } from '@/lib/adminActions'

// Safety net for studio_jobs nobody polled to completion (e.g. the user
// closed the tab mid-generation) — same dual-auth + reporting shape as
// vps-reconcile and crm-leadgen. Anything stuck past STUCK_MINUTES gets one
// more real status check; a job RunPod itself has lost track of is failed
// out and refunded rather than left charged forever.
export const maxDuration = 60
const STUCK_MINUTES = 15

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isAdminKey = process.env.BARIO_ADMIN_API_KEY && authHeader === `Bearer ${process.env.BARIO_ADMIN_API_KEY}`
  if (!isCron && !isAdminKey) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const sql = await db()
  const resolved: string[] = []
  const errors: string[] = []

  const stuckRows = (await sql`
    SELECT * FROM studio_jobs
    WHERE status IN ('pending', 'processing') AND created_at < now() - make_interval(mins => ${STUCK_MINUTES})
  `) as unknown as StudioJobRow[]

  for (const job of stuckRows) {
    try {
      const result = await resolveStudioJob(sql, job)
      if (result.status !== job.status) resolved.push(job.id)
    } catch (err: any) {
      errors.push(`${job.id}: ${err.message}`)
    }
  }

  if (resolved.length > 0 || errors.length > 0) {
    await logAdminAction(sql, {
      action: 'studio-reconcile-run',
      params: { resolved, errors },
      result: errors.length > 0 && resolved.length === 0 ? 'error' : 'ok',
      triggeredBy: 'ai_autonomous',
    })
  }

  return NextResponse.json({ ok: true, resolved, errors })
}
