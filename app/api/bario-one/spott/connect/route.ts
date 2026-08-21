import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'
import type { SpottListing } from '@/lib/db'

const SPOTT_BASE_URL = process.env.SPOTT_BASE_URL || 'https://www.spott.ca'
const PARTNER_SECRET = process.env.CRM_PARTNER_SECRET || ''

// GET — current connection state, for the settings page.
export async function GET() {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`SELECT * FROM spott_listings WHERE organization_id = ${org.id} AND sync_status != 'not_connected' ORDER BY updated_at DESC LIMIT 1`) as unknown as SpottListing[]
    return NextResponse.json({ listing: rows[0] ?? null })
  } catch (err: any) {
    return errorResponse(err)
  }
}

// POST — start a connection request to a pre-existing Spott listing. Never
// skips the real owner's approval (D4) — that only happens for a
// brand-new listing, via /connect/provision.
export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, user, org } = auth

    if (!PARTNER_SECRET) return NextResponse.json({ error: 'Spott integration is not configured (missing CRM_PARTNER_SECRET)' }, { status: 500 })

    const existing = (await sql`SELECT id FROM spott_listings WHERE organization_id = ${org.id} AND sync_status != 'not_connected'`) as unknown as { id: string }[]
    if (existing.length > 0) return NextResponse.json({ error: 'This organization already has a connected Spott listing. Disconnect first.' }, { status: 409 })

    const { business_id, business_name } = await req.json()
    if (typeof business_id !== 'string' || !business_id) return NextResponse.json({ error: 'business_id is required' }, { status: 400 })

    const res = await fetch(`${SPOTT_BASE_URL}/api/public/crm/connections/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bario-partner-secret': PARTNER_SECRET },
      body: JSON.stringify({
        business_id,
        requesting_org_id: org.id,
        requesting_org_name: org.name,
        requesting_contact_email: user.email,
      }),
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data?.error?.message || 'Could not request connection' }, { status: res.status })

    const listingId = randomUUID()
    await sql`
      INSERT INTO spott_listings (id, organization_id, external_spott_id, name, sync_status)
      VALUES (${listingId}, ${org.id}, ${business_id}, ${business_name || 'Pending listing'}, 'pending')
    `

    return NextResponse.json({ request_id: data.request_id, already_requested: !!data.already_requested })
  } catch (err: any) {
    return errorResponse(err)
  }
}
