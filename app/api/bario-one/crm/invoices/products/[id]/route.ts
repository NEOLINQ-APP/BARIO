import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

// PATCH-only (no DELETE): bo_invoice_items.product_id references this table
// with no ON DELETE clause, so a hard delete would fail once a product has
// ever been used on an invoice. "Deactivate" (status='inactive', hidden from
// the picker but still resolvable for old invoices) is the correct model
// here, same as bo_products.status is already used for elsewhere.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('invoicing')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can edit products/services' }, { status: 403 })
    }

    const existing = (await sql`SELECT id FROM bo_products WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown[]
    if (existing.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { name, description, sku, priceCents, costCents, status } = await req.json()

    await sql`
      UPDATE bo_products SET
        name = COALESCE(${name || null}, name),
        description = ${description ?? null},
        sku = ${sku ?? null},
        price_cents = COALESCE(${Number.isFinite(priceCents) ? Math.round(priceCents) : null}, price_cents),
        cost_cents = COALESCE(${Number.isFinite(costCents) ? Math.round(costCents) : null}, cost_cents),
        status = COALESCE(${status === 'active' || status === 'inactive' ? status : null}, status),
        updated_at = now()
      WHERE id = ${params.id} AND organization_id = ${org.id}
    `
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
