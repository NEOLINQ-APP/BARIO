import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import { generateReceiptPdf } from '@/lib/barioOnePos'
import type { BoPosSale, BoPosSaleItem, BoCustomer } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const saleRows = (await sql`SELECT * FROM bo_pos_sales WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as BoPosSale[]
    const sale = saleRows[0]
    if (!sale) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const items = (await sql`SELECT * FROM bo_pos_sale_items WHERE sale_id = ${sale.id} ORDER BY sort_order`) as unknown as BoPosSaleItem[]
    let customer: BoCustomer | null = null
    if (sale.customer_id) {
      const customerRows = (await sql`SELECT * FROM bo_customers WHERE id = ${sale.customer_id}`) as unknown as BoCustomer[]
      customer = customerRows[0] ?? null
    }

    const pdfBytes = await generateReceiptPdf(org, sale, items, customer)
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="receipt-${sale.id.slice(0, 8)}.pdf"` },
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
