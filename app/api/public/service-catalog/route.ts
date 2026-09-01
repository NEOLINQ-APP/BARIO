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
export async function GET(req: Request) {
  try {
    const businessKey = new URL(req.url).searchParams.get('businessKey') ?? ''
    const orgId = BARIO_ONE_CALL_LOG_ORG_IDS[businessKey]
    if (!orgId) return NextResponse.json({ error: 'Unknown business' }, { status: 404 })

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
      estimatedDurationHours: r.estimated_duration_hours,
      description: r.description,
      inclusions: JSON.parse(r.inclusions_json || '[]'),
      exclusions: JSON.parse(r.exclusions_json || '[]'),
      isAddon: r.is_addon,
    }))

    return NextResponse.json(
      { ok: true, items },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=120' } }
    )
  } catch (err) {
    return errorResponse(err)
  }
}
