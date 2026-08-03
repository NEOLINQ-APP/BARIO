import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computeTotals } from '@/lib/invoices'
import { errorResponse } from '@/lib/errors'
import type { Invoice, InvoiceLineItem } from '@/lib/db'

// No auth — access is gated by knowing the unguessable public_token (a
// random UUID), the same "unguessable id is the boundary" shape as other
// no-login shareable links in this codebase.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  try {
    const sql = await db()
    const rows = (await sql`SELECT * FROM invoices WHERE public_token = ${params.token}`) as unknown as Invoice[]
    const invoice = rows[0]
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const lineItems = (await sql`SELECT * FROM invoice_line_items WHERE invoice_id = ${invoice.id} ORDER BY sort_order`) as unknown as InvoiceLineItem[]
    const totals = computeTotals(
      lineItems.map((li) => ({ description: li.description, quantity: Number(li.quantity), unitPriceCents: li.unit_price_cents })),
      Number(invoice.tax_percent),
      { type: invoice.discount_type, value: Number(invoice.discount_value) }
    )

    return NextResponse.json({
      ok: true,
      invoice: {
        type: invoice.type,
        number: invoice.number,
        status: invoice.status,
        clientName: invoice.client_name,
        clientEmail: invoice.client_email,
        clientAddress: invoice.client_address,
        currency: invoice.currency,
        notes: invoice.notes,
        dueDate: invoice.due_date,
        createdAt: invoice.created_at,
        taxPercent: Number(invoice.tax_percent),
        discountType: invoice.discount_type,
        discountValue: Number(invoice.discount_value),
      },
      lineItems: lineItems.map((li) => ({ description: li.description, quantity: Number(li.quantity), unitPriceCents: li.unit_price_cents })),
      totals,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
