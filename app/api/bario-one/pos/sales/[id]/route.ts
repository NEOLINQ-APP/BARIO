import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import type { BoPosSale, BoPosSaleItem } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`
      SELECT s.*, c.contact_name as customer_name FROM bo_pos_sales s
      LEFT JOIN bo_customers c ON c.id = s.customer_id
      WHERE s.id = ${params.id} AND s.organization_id = ${org.id}
    `) as unknown as (BoPosSale & { customer_name: string | null })[]
    const sale = rows[0]
    if (!sale) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const items = (await sql`SELECT * FROM bo_pos_sale_items WHERE sale_id = ${sale.id} ORDER BY sort_order`) as unknown as BoPosSaleItem[]

    return NextResponse.json({ sale, items })
  } catch (err: any) {
    return errorResponse(err)
  }
}
