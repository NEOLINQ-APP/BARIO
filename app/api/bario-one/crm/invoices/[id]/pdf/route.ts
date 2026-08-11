import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { generateBoInvoicePdf } from '@/lib/barioOneInvoices'
import type { BoInvoice, BoInvoiceItem, BoCustomer } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('invoicing')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`SELECT * FROM bo_invoices WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as BoInvoice[]
    const invoice = rows[0]
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const items = (await sql`SELECT * FROM bo_invoice_items WHERE invoice_id = ${invoice.id} ORDER BY sort_order`) as unknown as BoInvoiceItem[]
    const customerRows = (await sql`SELECT * FROM bo_customers WHERE id = ${invoice.customer_id}`) as unknown as BoCustomer[]
    const customer = customerRows[0]
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    const pdfBytes = await generateBoInvoicePdf(org, customer, invoice, items)
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${invoice.number}.pdf"` },
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
