import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateBoInvoicePdf } from '@/lib/barioOneInvoices'
import type { BoInvoice, BoInvoiceItem, BoCustomer, BoOrganization } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  try {
    const sql = await db()
    const rows = (await sql`SELECT * FROM bo_invoices WHERE public_token = ${params.token}`) as unknown as BoInvoice[]
    const invoice = rows[0]
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const items = (await sql`SELECT * FROM bo_invoice_items WHERE invoice_id = ${invoice.id} ORDER BY sort_order`) as unknown as BoInvoiceItem[]
    const customerRows = (await sql`SELECT * FROM bo_customers WHERE id = ${invoice.customer_id}`) as unknown as BoCustomer[]
    const orgRows = (await sql`SELECT * FROM bo_organizations WHERE id = ${invoice.organization_id}`) as unknown as BoOrganization[]
    const customer = customerRows[0]
    const org = orgRows[0]
    if (!customer || !org) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const pdfBytes = await generateBoInvoicePdf(org, customer, invoice, items)
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${invoice.number}.pdf"` },
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
