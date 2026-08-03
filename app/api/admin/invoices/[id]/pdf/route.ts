import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { generateInvoicePdf } from '@/lib/invoices'
import { errorResponse } from '@/lib/errors'
import type { Invoice, InvoiceLineItem } from '@/lib/db'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`SELECT * FROM invoices WHERE id = ${params.id}`) as unknown as Invoice[]
    const invoice = rows[0]
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const lineItems = (await sql`SELECT * FROM invoice_line_items WHERE invoice_id = ${invoice.id} ORDER BY sort_order`) as unknown as InvoiceLineItem[]
    const pdfBytes = await generateInvoicePdf(sql, invoice, lineItems)

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${invoice.number}.pdf"`,
      },
    })
  } catch (err) {
    return errorResponse(err)
  }
}
