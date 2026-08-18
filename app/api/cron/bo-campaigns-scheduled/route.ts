import { NextResponse } from 'next/server'
import { db, type BoOrganization, type BoEmailCampaign } from '@/lib/db'
import { sendCampaignNow } from '@/lib/barioOneCampaigns'
import { logAdminAction } from '@/lib/adminActions'

export const maxDuration = 60

// Delivers any bo_email_campaigns whose scheduled_at has arrived -- the
// other half of the scheduling feature (createCampaign() only ever writes
// status='scheduled' for a future date, never sends directly). Runs every
// 5 minutes, same cadence as the existing crm-outreach-scheduled cron this
// mirrors (see vercel.json).
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isAdminKey = process.env.BARIO_ADMIN_API_KEY && authHeader === `Bearer ${process.env.BARIO_ADMIN_API_KEY}`
  if (!isCron && !isAdminKey) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const sql = await db()
  const due = (await sql`
    SELECT * FROM bo_email_campaigns WHERE status = 'scheduled' AND scheduled_at <= now()
  `) as unknown as BoEmailCampaign[]

  const sent: string[] = []
  const errors: string[] = []

  for (const campaign of due) {
    try {
      const orgRows = (await sql`SELECT * FROM bo_organizations WHERE id = ${campaign.organization_id}`) as unknown as BoOrganization[]
      const org = orgRows[0]
      if (!org) {
        await sql`UPDATE bo_email_campaigns SET status = 'failed', updated_at = now() WHERE id = ${campaign.id}`
        errors.push(`${campaign.id}: organization not found`)
        continue
      }
      await sendCampaignNow(sql, org, campaign)
      sent.push(campaign.id)
    } catch (err: any) {
      errors.push(`${campaign.id}: ${err.message}`)
    }
  }

  if (sent.length || errors.length) {
    await logAdminAction(sql, {
      action: 'bo-campaigns-scheduled-run',
      params: { sent, errors },
      result: errors.length && !sent.length ? 'error' : 'ok',
      triggeredBy: 'ai_autonomous',
    })
  }

  return NextResponse.json({ ok: true, sent, errors })
}
