import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import type { BoProduct } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// A second entry point into the SAME bo_products table POS/Inventory
// already uses (see app/api/bario-one/pos/products/route.ts) — gated on
// 'invoicing' instead of 'pos' so a service business without POS enabled
// can still keep a product/service catalog for its invoices. item_type
// lets a pure-services org ignore stock_quantity/barcode entirely.
export async function GET(req: Request) {
  try {
    const auth = await requireBoModule('invoicing')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const url = new URL(req.url)
    const q = url.searchParams.get('q')?.trim()
    // The invoice-create picker only wants active items; the catalog
    // management page needs inactive ones too so they can be reactivated.
    const includeInactive = url.searchParams.get('includeInactive') === '1'

    const rows = (q
      ? await sql`
          SELECT * FROM bo_products WHERE organization_id = ${org.id} AND (status = 'active' OR ${includeInactive})
            AND (name ILIKE ${'%' + q + '%'} OR sku ILIKE ${'%' + q + '%'})
          ORDER BY name
        `
      : await sql`SELECT * FROM bo_products WHERE organization_id = ${org.id} AND (status = 'active' OR ${includeInactive}) ORDER BY name`) as unknown as BoProduct[]

    return NextResponse.json({ products: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('invoicing')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can add products/services' }, { status: 403 })
    }

    const { name, description, itemType, sku, priceCents, costCents } = await req.json()
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    const type = itemType === 'service' ? 'service' : 'product'

    const id = randomUUID()
    await sql`
      INSERT INTO bo_products (id, organization_id, name, description, item_type, sku, price_cents, cost_cents)
      VALUES (
        ${id}, ${org.id}, ${name.trim()}, ${description || null}, ${type}, ${sku || null},
        ${Number.isFinite(priceCents) ? Math.round(priceCents) : 0}, ${Number.isFinite(costCents) ? Math.round(costCents) : 0}
      )
    `
    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
