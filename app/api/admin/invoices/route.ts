import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { computeTotals } from '@/lib/invoices'
import { insertNewInvoice, type LineItemBody } from '@/lib/invoiceMutations'
import { errorResponse } from '@/lib/errors'
import type { Invoice, InvoiceLineItem } from '@/lib/db'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const invoices = (await sql`SELECT * FROM invoices ORDER BY created_at DESC LIMIT 200`) as unknown as Invoice[]
    const lineItems = (await sql`
      SELECT * FROM invoice_line_items WHERE invoice_id = ANY(${invoices.map((i) => i.id)}) ORDER BY sort_order
    `) as unknown as InvoiceLineItem[]

    const withTotals = invoices.map((invoice) => {
      const items = lineItems.filter((li) => li.invoice_id === invoice.id)
      const totals = computeTotals(
        items.map((li) => ({ description: li.description, quantity: Number(li.quantity), unitPriceCents: li.unit_price_cents })),
        Number(invoice.tax_percent),
        { type: invoice.discount_type, value: Number(invoice.discount_value) }
      )
      return { ...invoice, totalCents: totals.totalCents }
    })

    return NextResponse.json({ ok: true, invoices: withTotals })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const body = await req.json().catch(() => ({}))
    const lineItems: LineItemBody[] = Array.isArray(body?.lineItems) ? body.lineItems : []

    const { id, number } = await insertNewInvoice(sql, {
      type: body?.type === 'quote' ? 'quote' : 'invoice',
      clientName: typeof body?.clientName === 'string' ? body.clientName : '',
      clientEmail: typeof body?.clientEmail === 'string' ? body.clientEmail.trim().toLowerCase() : null,
      clientPhone: typeof body?.clientPhone === 'string' ? body.clientPhone.trim() : null,
      clientAddress: typeof body?.clientAddress === 'string' ? body.clientAddress.trim() : null,
      currency: typeof body?.currency === 'string' && body.currency.trim() ? body.currency.trim().toUpperCase() : 'CAD',
      taxPercent: Number(body?.taxPercent) || 0,
      discountType: ['none', 'percent', 'fixed'].includes(body?.discountType) ? body.discountType : 'none',
      discountValue: Number(body?.discountValue) || 0,
      notes: typeof body?.notes === 'string' ? body.notes.trim() : null,
      dueDate: typeof body?.dueDate === 'string' && body.dueDate ? body.dueDate : null,
      lineItems,
    })

    return NextResponse.json({ ok: true, id, number })
  } catch (err: any) {
    if (err.message === 'Client name is required' || err.message?.includes('line item')) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    return errorResponse(err)
  }
}
