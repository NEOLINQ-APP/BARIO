import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateInvoicePdf } from '@/lib/invoices'
import { errorResponse } from '@/lib/errors'
import type { Invoice, InvoiceLineItem } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  try {
    const sql = await db()
    const rows = (await sql`SELECT * FROM invoices WHERE public_token = ${params.token}`) as unknown as Invoice[]
    const invoice = rows[0]
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const lineItems = (await sql`SELECT * FROM invoice_line_items WHERE invoice_id = ${invoice.id} ORDER BY sort_order`) as unknown as InvoiceLineItem[]
    const pdfBytes = await generateInvoicePdf(sql, invoice, lineItems)

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${invoice.number}.pdf"`,
      },
    })
  } catch (err) {
    return errorResponse(err)
  }
}
