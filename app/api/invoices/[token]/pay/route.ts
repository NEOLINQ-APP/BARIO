import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createInvoicePaymentSession } from '@/lib/invoices'
import { errorResponse } from '@/lib/errors'
import type { Invoice, InvoiceLineItem } from '@/lib/db'

export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const sql = await db()
    const rows = (await sql`SELECT * FROM invoices WHERE public_token = ${params.token}`) as unknown as Invoice[]
    const invoice = rows[0]
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (invoice.status === 'paid') return NextResponse.json({ error: 'This invoice is already paid' }, { status: 409 })
    if (invoice.status === 'void') return NextResponse.json({ error: 'This invoice has been voided' }, { status: 409 })
    if (invoice.type === 'quote') return NextResponse.json({ error: 'Quotes cannot be paid directly — ask for an invoice' }, { status: 400 })

    const lineItems = (await sql`SELECT * FROM invoice_line_items WHERE invoice_id = ${invoice.id} ORDER BY sort_order`) as unknown as InvoiceLineItem[]
    const origin = req.headers.get('origin') ?? 'https://www.bario.ca'
    const url = await createInvoicePaymentSession(invoice, lineItems, origin)

    return NextResponse.json({ ok: true, url })
  } catch (err) {
    return errorResponse(err)
  }
}
