import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// Cancels a campaign that hasn't gone out yet -- draft/scheduled only.
// Once status is 'sending'/'sent'/'failed' there's nothing left to cancel
// (sendCampaignNow has already started or finished looping recipients).
export async function DELETE(req: Request, { params }: { params: { id: string; campaignId: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`
      DELETE FROM bo_email_campaigns
      WHERE id = ${params.campaignId} AND organization_id = ${params.id} AND status IN ('draft', 'scheduled')
      RETURNING id
    `) as unknown as { id: string }[]
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Campaign not found, or already sent/sending — nothing left to cancel' }, { status: 404 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
