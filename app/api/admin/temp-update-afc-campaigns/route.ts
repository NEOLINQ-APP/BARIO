import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const freight = await sql`
      UPDATE bo_ad_campaigns SET
        headlines_json = ${JSON.stringify([
          'Freight Shipping Across Canada',
          'Reliable Freight Dispatch',
          'Coast to Coast Trucking',
          'Full Truckload & LTL Freight',
        ])},
        descriptions_json = ${JSON.stringify([
          'Full truckload, LTL, and long-haul freight with real dispatch tracking.',
          'AFC Logistics moves shipments across Canada, on time, every time.',
        ])}
      WHERE organization_id = 'db97fd81-faee-4489-af7e-3bb813886c53' AND name LIKE 'Freight Shipping%'
      RETURNING id, name
    `
    const hotshot = await sql`
      UPDATE bo_ad_campaigns SET
        headlines_json = ${JSON.stringify([
          'Same-Day Hotshot Delivery',
          'Urgent Freight Pickup Alberta',
          'Expedited Trucking Dispatch',
          'Fast Alberta Freight Service',
        ])},
        descriptions_json = ${JSON.stringify([
          'Urgent load? Same-day and hotshot freight across Alberta.',
          'Real dispatchers, real trucks, no broker middleman.',
        ])}
      WHERE organization_id = 'db97fd81-faee-4489-af7e-3bb813886c53' AND name LIKE 'Same-Day%'
      RETURNING id, name
    `
    return NextResponse.json({ ok: true, freight, hotshot })
  } catch (err: any) {
    return errorResponse(err)
  }
}
