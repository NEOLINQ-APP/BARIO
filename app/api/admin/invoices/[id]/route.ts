import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { computeTotals } from '@/lib/invoices'
import { applyInvoiceUpdate, type LineItemBody } from '@/lib/invoiceMutations'
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
    const totals = computeTotals(
      lineItems.map((li) => ({ description: li.description, quantity: Number(li.quantity), unitPriceCents: li.unit_price_cents })),
      Number(invoice.tax_percent),
      { type: invoice.discount_type, value: Number(invoice.discount_value) }
    )

    return NextResponse.json({ ok: true, invoice, lineItems, totals })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const body = await req.json().catch(() => ({}))
    const lineItems: LineItemBody[] | undefined = Array.isArray(body?.lineItems) ? body.lineItems : undefined

    await applyInvoiceUpdate(sql, params.id, {
      clientName: typeof body?.clientName === 'string' ? body.clientName.trim() : undefined,
      clientEmail: typeof body?.clientEmail === 'string' ? body.clientEmail.trim().toLowerCase() : undefined,
      clientPhone: typeof body?.clientPhone === 'string' ? body.clientPhone.trim() : undefined,
      clientAddress: typeof body?.clientAddress === 'string' ? body.clientAddress.trim() : undefined,
      currency: typeof body?.currency === 'string' && body.currency.trim() ? body.currency.trim().toUpperCase() : undefined,
      taxPercent: body?.taxPercent !== undefined ? Number(body.taxPercent) || 0 : undefined,
      discountType: ['none', 'percent', 'fixed'].includes(body?.discountType) ? body.discountType : undefined,
      discountValue: body?.discountValue !== undefined ? Number(body.discountValue) || 0 : undefined,
      notes: typeof body?.notes === 'string' ? body.notes.trim() : undefined,
      dueDate: body?.dueDate !== undefined ? body.dueDate || null : undefined,
      status: ['draft', 'sent', 'void'].includes(body?.status) ? body.status : undefined,
      lineItems,
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    if (err.message === 'Invoice not found') return NextResponse.json({ error: err.message }, { status: 404 })
    if (err.message === 'A paid invoice cannot be edited') return NextResponse.json({ error: err.message }, { status: 409 })
    if (err.message?.includes('line item')) return NextResponse.json({ error: err.message }, { status: 400 })
    return errorResponse(err)
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`SELECT status FROM invoices WHERE id = ${params.id}`) as unknown as { status: string }[]
    if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (rows[0].status === 'paid') return NextResponse.json({ error: 'A paid invoice cannot be deleted — void it instead' }, { status: 409 })

    await sql`DELETE FROM invoices WHERE id = ${params.id}`
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
