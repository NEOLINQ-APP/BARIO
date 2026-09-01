import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { BARIO_ONE_CALL_LOG_ORG_IDS } from '@/lib/barioOneCrmCallLog'
import { errorResponse } from '@/lib/errors'
import type { BoServiceCatalogItem } from '@/lib/db'

// Public, unauthenticated read of an org's service catalog — the same data
// the Hydro AI chat's system prompt is built from (see hydro-chat/route.ts),
// so a client site's own JS (booking wizard pricing, package listings) and
// the chat assistant can never show conflicting numbers. Reuses the same
// businessKey allowlist as /api/public/site-lead rather than a separate
// one — one place that maps "which public key maps to which org."
// CORS-open like site-lead — called cross-origin from a client's own
// raw_html site (e.g. hydroblasters.bario.ca calling www.bario.ca).
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(req: Request) {
  try {
    const businessKey = new URL(req.url).searchParams.get('businessKey') ?? ''
    const orgId = BARIO_ONE_CALL_LOG_ORG_IDS[businessKey]
    if (!orgId) return NextResponse.json({ error: 'Unknown business' }, { status: 404, headers: CORS_HEADERS })

    const sql = await db()
    const rows = (await sql`
      SELECT * FROM bo_service_catalog WHERE organization_id = ${orgId} AND active = true ORDER BY sort_order ASC, category ASC, name ASC
    `) as unknown as BoServiceCatalogItem[]

    const items = rows.map((r) => ({
      id: r.id,
      category: r.category,
      subcategory: r.subcategory,
      name: r.name,
      slug: r.slug,
      priceType: r.price_type,
      priceCents: r.price_cents,
      // NUMERIC column -- postgres.js returns it as a string; coerce so
      // clients get a real number (see the booking route's own comment for
      // the concrete bug this avoids).
      estimatedDurationHours: r.estimated_duration_hours == null ? null : Number(r.estimated_duration_hours),
      description: r.description,
      inclusions: JSON.parse(r.inclusions_json || '[]'),
      exclusions: JSON.parse(r.exclusions_json || '[]'),
      isAddon: r.is_addon,
    }))

    return NextResponse.json(
      { ok: true, items },
      { headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=120' } }
    )
  } catch (err) {
    const res = errorResponse(err)
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v))
    return res
  }
}
