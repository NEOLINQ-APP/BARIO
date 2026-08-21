import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { placeMikoOutboundCall, sendSms } from '@/lib/twilio'

// Fires whatever schedule_reminder (lib/victoriaAppTools.ts) has queued and
// is now due -- a wake-up call, a reminder call, a scheduled text. Same
// 5-minute cadence as bo-campaigns-scheduled, the finest existing cron in
// this project; a scheduled action can land up to ~5 minutes after its
// exact run_at as a result, which the tool's own description already sets
// expectations for.
export const maxDuration = 60

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isAdminKey = process.env.BARIO_ADMIN_API_KEY && authHeader === `Bearer ${process.env.BARIO_ADMIN_API_KEY}`
  if (!isCron && !isAdminKey) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const sql = await db()

  const due = (await sql`
    SELECT id, action_type, to_number, message FROM victoria_scheduled_actions
    WHERE status = 'pending' AND run_at <= now()
    ORDER BY run_at ASC LIMIT 25
  `) as unknown as { id: string; action_type: string; to_number: string; message: string }[]

  const fired: string[] = []
  const failed: string[] = []

  for (const action of due) {
    try {
      if (action.action_type === 'call') {
        const result = await placeMikoOutboundCall({ toNumber: action.to_number, jobContext: action.message })
        await sql`
          UPDATE victoria_scheduled_actions SET status = 'completed', result = ${`Call placed, sid ${result.sid}`}, completed_at = now()
          WHERE id = ${action.id}
        `
      } else {
        const result = await sendSms(action.to_number, action.message)
        await sql`
          UPDATE victoria_scheduled_actions SET status = 'completed', result = ${`Text sent, sid ${result.sid}`}, completed_at = now()
          WHERE id = ${action.id}
        `
      }
      fired.push(action.id)
    } catch (err: any) {
      console.error(`victoria-scheduled-actions: ${action.action_type} failed for ${action.id}`, err)
      await sql`
        UPDATE victoria_scheduled_actions SET status = 'failed', result = ${String(err?.message ?? err)}, completed_at = now()
        WHERE id = ${action.id}
      `
      failed.push(action.id)
    }
  }

  return NextResponse.json({ ok: true, fired, failed })
}
