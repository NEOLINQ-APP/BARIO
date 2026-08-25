import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { pushCampaignToGoogleAds } from '@/lib/googleAdsApi'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const campaignRows = (await sql`
      SELECT * FROM bo_ad_campaigns WHERE id = ${params.id} AND organization_id = ${org.id}
    `) as unknown[]
    const campaign = campaignRows[0] as any
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    const connectionRows = (await sql`
      SELECT * FROM bo_google_ads_connections WHERE organization_id = ${org.id}
    `) as unknown[]
    const connection = connectionRows[0] as any
    if (!connection) return NextResponse.json({ error: 'Google Ads is not connected yet' }, { status: 400 })

    const result = await pushCampaignToGoogleAds(sql, campaign, connection)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })
    return NextResponse.json({ ok: true, googleAdsCampaignId: result.googleAdsCampaignId })
  } catch (err: any) {
    return errorResponse(err)
  }
}
