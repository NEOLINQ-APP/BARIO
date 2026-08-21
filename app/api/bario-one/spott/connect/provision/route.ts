import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

const SPOTT_BASE_URL = process.env.SPOTT_BASE_URL || 'https://www.spott.ca'
const PARTNER_SECRET = process.env.CRM_PARTNER_SECRET || ''

// D4's exception: creating a BRAND-NEW Spott listing skips the human
// approval flow entirely — nothing else could have owned it a moment ago.
// Still goes through Spott's own moderation pipeline on their side
// (status='pending', is_claimed=false).
export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    if (!PARTNER_SECRET) return NextResponse.json({ error: 'Spott integration is not configured (missing CRM_PARTNER_SECRET)' }, { status: 500 })

    const existing = (await sql`SELECT id FROM spott_listings WHERE organization_id = ${org.id} AND sync_status != 'not_connected'`) as unknown as { id: string }[]
    if (existing.length > 0) return NextResponse.json({ error: 'This organization already has a connected Spott listing. Disconnect first.' }, { status: 409 })

    const body = await req.json()
    const { name, city, province } = body
    if (!name?.trim() || !city?.trim() || !province?.trim()) {
      return NextResponse.json({ error: 'name, city, and province are required' }, { status: 400 })
    }

    const res = await fetch(`${SPOTT_BASE_URL}/api/public/crm/businesses/provision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bario-partner-secret': PARTNER_SECRET },
      body: JSON.stringify({
        requesting_org_id: org.id,
        requesting_org_name: org.name,
        name: name.trim(),
        city: city.trim(),
        province: province.trim(),
        address: body.address || null,
        phone: body.phone || null,
        email: body.email || null,
        website: body.website || null,
        description: body.description || null,
      }),
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data?.error?.message || 'Could not create the listing' }, { status: res.status })

    const listingId = randomUUID()
    await sql`
      INSERT INTO spott_listings (id, organization_id, external_spott_id, name, public_url, sync_status, last_synced_at)
      VALUES (${listingId}, ${org.id}, ${data.business_id}, ${name.trim()}, ${data.public_url || null}, 'synced', now())
    `
    await sql`
      INSERT INTO spott_connection_credentials (id, listing_id, api_key, webhook_signing_secret)
      VALUES (${randomUUID()}, ${listingId}, ${data.api_key}, ${data.webhook_signing_secret})
    `

    return NextResponse.json({ ok: true, listing_id: listingId, public_url: data.public_url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
