import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { createCampaign } from '@/lib/barioOneCampaigns'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'
import type { BoOrganization, BoEmailCampaign } from '@/lib/db'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  const campaigns = (await sql`
    SELECT * FROM bo_email_campaigns WHERE organization_id = ${params.id} ORDER BY created_at DESC
  `) as unknown as BoEmailCampaign[]

  return NextResponse.json({ ok: true, campaigns })
}

// Creates a campaign and either sends it immediately (no scheduledAt, or
// one already in the past) or leaves it for the /api/cron/bo-campaigns-
// scheduled cron to pick up once its time arrives -- same admin-panel and
// Miko-tool entry point, see lib/barioOneCampaigns.ts's createCampaign().
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const orgRows = (await sql`SELECT * FROM bo_organizations WHERE id = ${params.id}`) as unknown as BoOrganization[]
    const org = orgRows[0]
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

    const { name, subject, body, scheduledAt } = await req.json()
    if (typeof name !== 'string' || !name.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })
    if (typeof subject !== 'string' || !subject.trim()) return NextResponse.json({ error: 'subject is required' }, { status: 400 })
    if (typeof body !== 'string' || !body.trim()) return NextResponse.json({ error: 'body is required' }, { status: 400 })

    let scheduledDate: Date | null = null
    if (scheduledAt) {
      scheduledDate = new Date(scheduledAt)
      if (Number.isNaN(scheduledDate.getTime())) return NextResponse.json({ error: 'scheduledAt is not a valid date' }, { status: 400 })
    }

    const campaign = await createCampaign(sql, org, {
      name: name.trim(),
      subject: subject.trim(),
      body,
      scheduledAt: scheduledDate,
      createdByUserId: null,
      createdVia: 'admin',
    })

    await logAdminAction(sql, {
      action: 'bario_one_admin_create_campaign',
      params: { orgId: org.id, campaignId: campaign.id, status: campaign.status, sentCount: campaign.sent_count },
      result: 'ok',
    })

    return NextResponse.json({ ok: true, campaign })
  } catch (err) {
    return errorResponse(err)
  }
}
