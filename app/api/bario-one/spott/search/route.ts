import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

const SPOTT_BASE_URL = process.env.SPOTT_BASE_URL || 'https://www.spott.ca'

// Proxies to Spott's public search (no auth on Spott's side, deliberately —
// see the plan's claim flow §1) so the partner secret and the request
// itself stay server-to-server, never reaching the browser directly.
export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth

    const { q } = await req.json()
    if (typeof q !== 'string' || q.trim().length < 2) return NextResponse.json({ results: [] })

    const res = await fetch(`${SPOTT_BASE_URL}/api/public/crm/businesses/search?q=${encodeURIComponent(q.trim())}`)
    if (!res.ok) return NextResponse.json({ error: 'Search failed' }, { status: 502 })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: any) {
    return errorResponse(err)
  }
}
