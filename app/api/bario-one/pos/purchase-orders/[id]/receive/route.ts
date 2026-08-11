import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import type { BoPurchaseOrder, BoPurchaseOrderItem } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// Marking a PO received is the actual restock action — stock only moves
// when goods are confirmed in hand, not when the order is merely placed.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('pos')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can receive stock' }, { status: 403 })
    }

    const poRows = (await sql`SELECT * FROM bo_purchase_orders WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as BoPurchaseOrder[]
    const po = poRows[0]
    if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (po.status === 'received') return NextResponse.json({ error: 'Already received' }, { status: 400 })

    await sql.begin(async (tx: any) => {
      const items = (await tx`SELECT * FROM bo_purchase_order_items WHERE purchase_order_id = ${po.id}`) as unknown as BoPurchaseOrderItem[]
      for (const item of items) {
        await tx`
          UPDATE bo_products SET stock_quantity = stock_quantity + ${item.quantity}, cost_cents = ${item.unit_cost_cents}, updated_at = now()
          WHERE id = ${item.product_id}
        `
      }
      await tx`UPDATE bo_purchase_orders SET status = 'received', updated_at = now() WHERE id = ${po.id}`
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
