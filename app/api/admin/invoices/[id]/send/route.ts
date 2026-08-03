import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { computeTotals } from '@/lib/invoices'
import { sendInvoiceEmail } from '@/lib/email'
import { errorResponse } from '@/lib/errors'
import type { Invoice, InvoiceLineItem } from '@/lib/db'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`SELECT * FROM invoices WHERE id = ${params.id}`) as unknown as Invoice[]
    const invoice = rows[0]
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Defaults to the invoice's own client_email, but the share menu lets an
    // admin also send a copy to a different address (e.g. an existing Bario
    // customer account picked from search) without changing who the
    // invoice itself belongs to.
    const body = await req.json().catch(() => ({}))
    const overrideTo = typeof body?.to === 'string' && body.to.trim() ? body.to.trim().toLowerCase() : null
    const recipient = overrideTo ?? invoice.client_email
    if (!recipient) return NextResponse.json({ error: 'No email address to send to' }, { status: 400 })
    if (invoice.status === 'paid' || invoice.status === 'void') return NextResponse.json({ error: `Cannot send a ${invoice.status} invoice` }, { status: 409 })

    const lineItems = (await sql`SELECT * FROM invoice_line_items WHERE invoice_id = ${invoice.id} ORDER BY sort_order`) as unknown as InvoiceLineItem[]
    const { totalCents } = computeTotals(
      lineItems.map((li) => ({ description: li.description, quantity: Number(li.quantity), unitPriceCents: li.unit_price_cents })),
      Number(invoice.tax_percent),
      { type: invoice.discount_type, value: Number(invoice.discount_value) }
    )

    const origin = req.headers.get('origin') ?? 'https://www.bario.ca'
    await sendInvoiceEmail(recipient, {
      type: invoice.type,
      number: invoice.number,
      totalDisplay: `${(totalCents / 100).toFixed(2)} ${invoice.currency}`,
      viewUrl: `${origin}/invoice/${invoice.public_token}`,
    })

    await sql`UPDATE invoices SET status = 'sent', updated_at = now() WHERE id = ${invoice.id}`
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
