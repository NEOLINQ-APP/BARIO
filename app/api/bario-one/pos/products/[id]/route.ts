import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('pos')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can edit products' }, { status: 403 })
    }

    const existing = (await sql`SELECT id FROM bo_products WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown[]
    if (existing.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { name, sku, barcode, priceCents, costCents, stockQuantity, lowStockThreshold, status } = await req.json()

    await sql`
      UPDATE bo_products SET
        name = COALESCE(${name || null}, name),
        sku = ${sku ?? null},
        barcode = ${barcode ?? null},
        price_cents = COALESCE(${Number.isFinite(priceCents) ? Math.round(priceCents) : null}, price_cents),
        cost_cents = COALESCE(${Number.isFinite(costCents) ? Math.round(costCents) : null}, cost_cents),
        stock_quantity = COALESCE(${Number.isFinite(stockQuantity) ? Math.round(stockQuantity) : null}, stock_quantity),
        low_stock_threshold = COALESCE(${Number.isFinite(lowStockThreshold) ? Math.round(lowStockThreshold) : null}, low_stock_threshold),
        status = COALESCE(${status === 'active' || status === 'inactive' ? status : null}, status),
        updated_at = now()
      WHERE id = ${params.id} AND organization_id = ${org.id}
    `
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('pos')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can delete products' }, { status: 403 })
    }

    await sql`DELETE FROM bo_products WHERE id = ${params.id} AND organization_id = ${org.id}`
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
