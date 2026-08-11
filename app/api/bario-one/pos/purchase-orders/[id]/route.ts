import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import type { BoPurchaseOrder, BoPurchaseOrderItem } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('pos')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`
      SELECT po.*, s.name as supplier_name FROM bo_purchase_orders po
      JOIN bo_suppliers s ON s.id = po.supplier_id
      WHERE po.id = ${params.id} AND po.organization_id = ${org.id}
    `) as unknown as (BoPurchaseOrder & { supplier_name: string })[]
    const po = rows[0]
    if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const items = (await sql`
      SELECT poi.*, p.name as product_name FROM bo_purchase_order_items poi
      JOIN bo_products p ON p.id = poi.product_id
      WHERE poi.purchase_order_id = ${po.id}
    `) as unknown as (BoPurchaseOrderItem & { product_name: string })[]

    return NextResponse.json({ purchaseOrder: po, items })
  } catch (err: any) {
    return errorResponse(err)
  }
}
