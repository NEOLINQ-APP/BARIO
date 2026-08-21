import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import { getSpottConnection } from '@/lib/spottIntegration'
import { errorResponse } from '@/lib/errors'
import type { SpottPromotion } from '@/lib/db'

const SPOTT_BASE_URL = process.env.SPOTT_BASE_URL || 'https://www.spott.ca'

export async function GET() {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`SELECT * FROM spott_promotions WHERE organization_id = ${org.id} ORDER BY created_at DESC`) as unknown as SpottPromotion[]
    return NextResponse.json({ promotions: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}

// Creates the promotion directly on Spott (Spott is authoritative — this
// isn't a proposal like the listing PATCH, since a promotion has no prior
// state to conflict with) and caches the confirmed row immediately using
// Spott's own response, rather than waiting on a webhook round-trip.
export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const conn = await getSpottConnection(sql, org.id)
    if (!conn) return NextResponse.json({ error: 'No connected Spott listing' }, { status: 404 })

    const { title, description, starts_at, ends_at } = await req.json()
    if (typeof title !== 'string' || !title.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

    const res = await fetch(`${SPOTT_BASE_URL}/api/public/crm/promotions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), description: description || null, starts_at: starts_at || null, ends_at: ends_at || null }),
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data?.error?.message || 'Spott rejected the promotion' }, { status: res.status })

    const id = randomUUID()
    await sql`
      INSERT INTO spott_promotions (id, organization_id, listing_id, external_promotion_id, title, description, starts_at, ends_at, status)
      VALUES (${id}, ${org.id}, ${conn.listing.id}, ${data.id}, ${data.title}, ${data.description}, ${data.starts_at}, ${data.ends_at}, ${data.status})
    `

    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
