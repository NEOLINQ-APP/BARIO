import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { getSpottConnection } from '@/lib/spottIntegration'
import { errorResponse } from '@/lib/errors'

const SPOTT_BASE_URL = process.env.SPOTT_BASE_URL || 'https://www.spott.ca'

// PATCH — a proposal, not a direct write to the cache (D1). Marks
// sync_status='pending' immediately; the row only flips back to 'synced'
// with the confirmed values once Spott's listing.updated webhook lands
// (see app/api/bario-one/spott/webhook/route.ts). If that webhook never
// arrives, the page keeps showing 'pending' honestly rather than assuming
// success.
export async function PATCH(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const conn = await getSpottConnection(sql, org.id)
    if (!conn) return NextResponse.json({ error: 'No connected Spott listing' }, { status: 404 })

    const body = await req.json()
    const patch: Record<string, unknown> = {}
    for (const field of ['description', 'phone', 'email', 'website', 'address'] as const) {
      if (field in body) patch[field] = body[field]
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 })

    const res = await fetch(`${SPOTT_BASE_URL}/api/public/crm/businesses/${conn.listing.external_spott_id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${conn.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data?.error?.message || 'Spott rejected the update' }, { status: res.status })

    await sql`UPDATE spott_listings SET sync_status = 'pending', updated_at = now() WHERE id = ${conn.listing.id}`

    return NextResponse.json({ ok: true, status: 'pending', note: 'Update sent — this listing will show the confirmed values once Spott syncs back.' })
  } catch (err: any) {
    return errorResponse(err)
  }
}
