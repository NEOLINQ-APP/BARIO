import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

const SPOTT_BASE_URL = process.env.SPOTT_BASE_URL || 'https://www.spott.ca'
const PARTNER_SECRET = process.env.CRM_PARTNER_SECRET || ''

// The BARIO admin enters the code the real Spott owner approved. This is
// the only moment the real API key/webhook secret exist in plaintext
// outside either DB — they're written straight to
// spott_connection_credentials and never sent back to the browser.
export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    if (!PARTNER_SECRET) return NextResponse.json({ error: 'Spott integration is not configured (missing CRM_PARTNER_SECRET)' }, { status: 500 })

    const { request_id, code } = await req.json()
    if (typeof request_id !== 'string' || typeof code !== 'string') {
      return NextResponse.json({ error: 'request_id and code are required' }, { status: 400 })
    }

    const res = await fetch(`${SPOTT_BASE_URL}/api/public/crm/connections/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bario-partner-secret': PARTNER_SECRET },
      body: JSON.stringify({ request_id, code }),
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data?.error?.message || 'Could not exchange code' }, { status: res.status })

    const listingRows = (await sql`
      SELECT id FROM spott_listings WHERE organization_id = ${org.id} AND external_spott_id = ${data.business_id}
    `) as unknown as { id: string }[]

    let listingId = listingRows[0]?.id
    if (listingId) {
      await sql`
        UPDATE spott_listings SET name = ${data.business_name || 'Spott listing'}, public_url = ${data.public_url || null}, sync_status = 'synced', last_synced_at = now(), updated_at = now()
        WHERE id = ${listingId}
      `
    } else {
      listingId = randomUUID()
      await sql`
        INSERT INTO spott_listings (id, organization_id, external_spott_id, name, public_url, sync_status, last_synced_at)
        VALUES (${listingId}, ${org.id}, ${data.business_id}, ${data.business_name || 'Spott listing'}, ${data.public_url || null}, 'synced', now())
      `
    }

    await sql`DELETE FROM spott_connection_credentials WHERE listing_id = ${listingId}`
    await sql`
      INSERT INTO spott_connection_credentials (id, listing_id, api_key, webhook_signing_secret)
      VALUES (${randomUUID()}, ${listingId}, ${data.api_key}, ${data.webhook_signing_secret})
    `

    return NextResponse.json({ ok: true, listing_id: listingId, public_url: data.public_url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
