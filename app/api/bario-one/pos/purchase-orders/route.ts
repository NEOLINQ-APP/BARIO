import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoMembership } from '@/lib/barioOne'
import type { BoPurchaseOrder } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`
      SELECT po.*, s.name as supplier_name FROM bo_purchase_orders po
      JOIN bo_suppliers s ON s.id = po.supplier_id
      WHERE po.organization_id = ${org.id}
      ORDER BY po.created_at DESC
    `) as unknown as (BoPurchaseOrder & { supplier_name: string })[]

    return NextResponse.json({ purchaseOrders: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, user, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can create purchase orders' }, { status: 403 })
    }

    const { supplierId, items, notes } = await req.json()
    if (typeof supplierId !== 'string' || !supplierId.trim()) {
      return NextResponse.json({ error: 'supplierId is required' }, { status: 400 })
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one item is required' }, { status: 400 })
    }

    const supplierRows = (await sql`SELECT id FROM bo_suppliers WHERE id = ${supplierId} AND organization_id = ${org.id}`) as unknown[]
    if (supplierRows.length === 0) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })

    const id = randomUUID()
    await sql.begin(async (tx: any) => {
      await tx`
        INSERT INTO bo_purchase_orders (id, organization_id, supplier_id, notes, created_by_user_id)
        VALUES (${id}, ${org.id}, ${supplierId}, ${notes || null}, ${user.id})
      `
      for (const item of items) {
        const productRows = (await tx`SELECT id FROM bo_products WHERE id = ${item.productId} AND organization_id = ${org.id}`) as unknown[]
        if (productRows.length === 0) throw new Error(`Product not found: ${item.productId}`)
        await tx`
          INSERT INTO bo_purchase_order_items (id, purchase_order_id, product_id, quantity, unit_cost_cents)
          VALUES (${randomUUID()}, ${id}, ${item.productId}, ${Number(item.quantity) || 1}, ${Math.round(Number(item.unitCostCents) || 0)})
        `
      }
    })

    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
