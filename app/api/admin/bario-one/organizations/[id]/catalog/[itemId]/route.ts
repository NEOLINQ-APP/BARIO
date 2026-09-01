import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/adminActions'
import { errorResponse } from '@/lib/errors'
import type { BoServiceCatalogItem } from '@/lib/db'

// The real "admin can change prices and adjust packages" capability —
// no dashboard UI yet, but a genuine, working edit path (curl/API today,
// a proper Bario One catalog page is the natural next step). Reads the
// existing row first and COALESCEs each field against it, same pattern as
// every other Bario One PATCH route in this codebase (e.g. the CRM
// customer PATCH) — a field the caller omits keeps its current value
// rather than needing fully-dynamic SQL.
export async function PATCH(req: Request, { params }: { params: { id: string; itemId: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const body = await req.json()
    const existingRows = (await sql`
      SELECT * FROM bo_service_catalog WHERE id = ${params.itemId} AND organization_id = ${params.id}
    `) as unknown as BoServiceCatalogItem[]
    const existing = existingRows[0]
    if (!existing) return NextResponse.json({ error: 'Catalog item not found' }, { status: 404 })

    const name = typeof body.name === 'string' ? body.name : existing.name
    const category = typeof body.category === 'string' ? body.category : existing.category
    const subcategory = body.subcategory === null || typeof body.subcategory === 'string' ? body.subcategory : existing.subcategory
    const priceType = typeof body.priceType === 'string' ? body.priceType : existing.price_type
    const priceCents = body.priceCents === null || typeof body.priceCents === 'number' ? body.priceCents : existing.price_cents
    const estimatedDurationHours =
      body.estimatedDurationHours === null || typeof body.estimatedDurationHours === 'number' ? body.estimatedDurationHours : existing.estimated_duration_hours
    const description = body.description === null || typeof body.description === 'string' ? body.description : existing.description
    const inclusionsJson = Array.isArray(body.inclusions) ? JSON.stringify(body.inclusions) : existing.inclusions_json
    const exclusionsJson = Array.isArray(body.exclusions) ? JSON.stringify(body.exclusions) : existing.exclusions_json
    const active = typeof body.active === 'boolean' ? body.active : existing.active
    const sortOrder = typeof body.sortOrder === 'number' ? body.sortOrder : existing.sort_order

    await sql`
      UPDATE bo_service_catalog SET
        name = ${name}, category = ${category}, subcategory = ${subcategory}, price_type = ${priceType},
        price_cents = ${priceCents}, estimated_duration_hours = ${estimatedDurationHours}, description = ${description},
        inclusions_json = ${inclusionsJson}, exclusions_json = ${exclusionsJson}, active = ${active}, sort_order = ${sortOrder},
        updated_at = now()
      WHERE id = ${params.itemId} AND organization_id = ${params.id}
    `

    await logAdminAction(sql, { action: 'catalog-item-update', params: { orgId: params.id, itemId: params.itemId }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string; itemId: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    await sql`DELETE FROM bo_service_catalog WHERE id = ${params.itemId} AND organization_id = ${params.id}`
    await logAdminAction(sql, { action: 'catalog-item-delete', params: { orgId: params.id, itemId: params.itemId }, result: 'ok', triggeredBy: auth.user ? 'admin' : 'ai_autonomous' })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
