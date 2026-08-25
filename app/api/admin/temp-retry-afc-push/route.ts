import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { pushCampaignToGoogleAds } from '@/lib/googleAdsApi'
import { errorResponse } from '@/lib/errors'

const AFC_ORG_ID = 'db97fd81-faee-4489-af7e-3bb813886c53'

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const campaignRows = (await sql`SELECT * FROM bo_ad_campaigns WHERE organization_id = ${AFC_ORG_ID}`) as unknown[]
    const connectionRows = (await sql`SELECT * FROM bo_google_ads_connections WHERE organization_id = ${AFC_ORG_ID}`) as unknown[]
    const connection = connectionRows[0] as any
    if (!connection) return NextResponse.json({ error: 'not connected' }, { status: 400 })

    const results = []
    for (const campaign of campaignRows as any[]) {
      const result = await pushCampaignToGoogleAds(sql, campaign, connection)
      results.push({ name: campaign.name, result })
    }
    return NextResponse.json({ ok: true, results })
  } catch (err: any) {
    return errorResponse(err)
  }
}
