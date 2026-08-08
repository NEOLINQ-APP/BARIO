import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import type { BoPosSale, BoPosSaleItem } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// Reverses everything the original checkout did: restocks each product
// line, claws back any loyalty points earned, marks the sale refunded.
// Doesn't touch real money — no Stripe integration on the POS side yet,
// so "refunded" here means the business's own records, not an automatic
// card refund.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can refund a sale' }, { status: 403 })
    }

    const saleRows = (await sql`SELECT * FROM bo_pos_sales WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as BoPosSale[]
    const sale = saleRows[0]
    if (!sale) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (sale.status === 'refunded') return NextResponse.json({ error: 'Already refunded' }, { status: 400 })

    await sql.begin(async (tx: any) => {
      const items = (await tx`SELECT * FROM bo_pos_sale_items WHERE sale_id = ${sale.id}`) as unknown as BoPosSaleItem[]
      for (const item of items) {
        if (item.product_id) {
          await tx`UPDATE bo_products SET stock_quantity = stock_quantity + ${item.quantity}, updated_at = now() WHERE id = ${item.product_id}`
        }
      }
      if (sale.customer_id && sale.loyalty_points_earned > 0) {
        await tx`UPDATE bo_customers SET loyalty_points = GREATEST(0, loyalty_points - ${sale.loyalty_points_earned}), updated_at = now() WHERE id = ${sale.customer_id}`
      }
      await tx`UPDATE bo_pos_sales SET status = 'refunded' WHERE id = ${sale.id}`
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
