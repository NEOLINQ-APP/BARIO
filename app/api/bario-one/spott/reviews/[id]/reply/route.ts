import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { getSpottConnection } from '@/lib/spottIntegration'
import { errorResponse } from '@/lib/errors'

const SPOTT_BASE_URL = process.env.SPOTT_BASE_URL || 'https://www.spott.ca'

// params.id is BARIO's own spott_reviews.id, not Spott's review id —
// resolved to external_review_id before calling out, so the URL never
// exposes Spott's internal id scheme.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const conn = await getSpottConnection(sql, org.id)
    if (!conn) return NextResponse.json({ error: 'No connected Spott listing' }, { status: 404 })

    const rows = (await sql`SELECT external_review_id FROM spott_reviews WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as { external_review_id: string | null }[]
    const externalReviewId = rows[0]?.external_review_id
    if (!externalReviewId) return NextResponse.json({ error: 'Review not found' }, { status: 404 })

    const { reply } = await req.json()
    if (typeof reply !== 'string' || !reply.trim()) return NextResponse.json({ error: 'Reply text is required' }, { status: 400 })

    const res = await fetch(`${SPOTT_BASE_URL}/api/public/crm/reviews/${externalReviewId}/reply`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${conn.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply: reply.trim() }),
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data?.error?.message || 'Spott rejected the reply' }, { status: res.status })

    await sql`UPDATE spott_reviews SET owner_reply = ${data.owner_reply}, owner_reply_at = ${data.owner_reply_at} WHERE id = ${params.id}`

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
