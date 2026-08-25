import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

const AFC_ORG_ID = 'db97fd81-faee-4489-af7e-3bb813886c53'

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const id = randomUUID()
    await sql`
      INSERT INTO bo_ad_campaigns (
        id, organization_id, name, objective, headline, description,
        keywords_json, target_locations, daily_budget_cents, final_url
      ) VALUES (
        ${id}, ${AFC_ORG_ID}, 'Freight Shipping — Local & Coast-to-Coast',
        'leads', 'Freight Shipping Across Canada', 'Full truckload, LTL, and long-haul freight with real dispatch tracking. Get a quote today.',
        ${JSON.stringify(['freight shipping', 'trucking company Alberta', 'LTL freight', 'coast to coast shipping', 'Edmonton freight broker', 'hotshot delivery Alberta'])},
        'Canada-wide', 5000, 'https://afclogistics.ca'
      )
    `
    const id2 = randomUUID()
    await sql`
      INSERT INTO bo_ad_campaigns (
        id, organization_id, name, objective, headline, description,
        keywords_json, target_locations, daily_budget_cents, final_url
      ) VALUES (
        ${id2}, ${AFC_ORG_ID}, 'Same-Day & Hotshot Delivery — Alberta',
        'leads', 'Same-Day Hotshot Delivery', 'Urgent load? Same-day and hotshot freight across Alberta. Real dispatchers, no broker middleman.',
        ${JSON.stringify(['hotshot trucking Alberta', 'same day delivery Edmonton', 'expedited freight', 'emergency freight pickup'])},
        'Alberta', 3500, 'https://afclogistics.ca'
      )
    `
    return NextResponse.json({ ok: true, ids: [id, id2] })
  } catch (err: any) {
    return errorResponse(err)
  }
}
