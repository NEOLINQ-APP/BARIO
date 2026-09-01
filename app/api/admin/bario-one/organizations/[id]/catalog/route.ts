import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'
import type { BoServiceCatalogItem, BoServiceCatalogPriceType } from '@/lib/db'

// Admin-Bearer catalog management for one org's bo_service_catalog — the
// single source of truth every public-facing surface (booking wizard, the
// Hydro AI chat, any future package pages) reads from. GET lists everything
// (admin view, includes inactive); POST bulk-seeds/reseeds from an array
// (used once at onboarding via lib/<business>Catalog.ts, safe to re-run —
// upserts by slug rather than blind-inserting duplicates).
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`
      SELECT * FROM bo_service_catalog WHERE organization_id = ${params.id} ORDER BY sort_order ASC, category ASC, name ASC
    `) as unknown as BoServiceCatalogItem[]
    return NextResponse.json({ ok: true, items: rows })
  } catch (err) {
    return errorResponse(err)
  }
}

type SeedItem = {
  category: string
  subcategory?: string | null
  name: string
  slug: string
  priceType: BoServiceCatalogPriceType
  priceCents: number | null
  estimatedDurationHours: number | null
  description?: string | null
  inclusions?: string[]
  exclusions?: string[]
  isAddon?: boolean
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const body = await req.json()
    const items = Array.isArray(body?.items) ? (body.items as SeedItem[]) : null
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'items array is required' }, { status: 400 })
    }

    let upserted = 0
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (!it.slug || !it.name || !it.category) continue
      await sql`
        INSERT INTO bo_service_catalog (
          id, organization_id, category, subcategory, name, slug, price_type, price_cents,
          estimated_duration_hours, description, inclusions_json, exclusions_json, is_addon, sort_order
        )
        VALUES (
          ${randomUUID()}, ${params.id}, ${it.category}, ${it.subcategory ?? null}, ${it.name}, ${it.slug},
          ${it.priceType}, ${it.priceCents}, ${it.estimatedDurationHours}, ${it.description ?? null},
          ${JSON.stringify(it.inclusions ?? [])}, ${JSON.stringify(it.exclusions ?? [])}, ${!!it.isAddon}, ${i}
        )
        ON CONFLICT (organization_id, slug) DO UPDATE SET
          category = EXCLUDED.category,
          subcategory = EXCLUDED.subcategory,
          name = EXCLUDED.name,
          price_type = EXCLUDED.price_type,
          price_cents = EXCLUDED.price_cents,
          estimated_duration_hours = EXCLUDED.estimated_duration_hours,
          description = EXCLUDED.description,
          inclusions_json = EXCLUDED.inclusions_json,
          exclusions_json = EXCLUDED.exclusions_json,
          is_addon = EXCLUDED.is_addon,
          sort_order = EXCLUDED.sort_order,
          updated_at = now()
      `
      upserted++
    }

    await logAdminAction(sql, { action: 'catalog-seed', params: { orgId: params.id, count: upserted }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true, upserted })
  } catch (err) {
    return errorResponse(err)
  }
}
