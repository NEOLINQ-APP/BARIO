import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computeTotals } from '@/lib/barioOneInvoices'
import type { BoInvoice, BoInvoiceItem, BoCustomer, BoOrganization } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// Public, unauthenticated — same shape/security model as the platform's
// own /api/invoices/[token]: the public_token itself IS the access control
// (unguessable random 32-hex-char value), not a session.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  try {
    const sql = await db()
    const rows = (await sql`SELECT * FROM bo_invoices WHERE public_token = ${params.token}`) as unknown as BoInvoice[]
    const invoice = rows[0]
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const items = (await sql`SELECT * FROM bo_invoice_items WHERE invoice_id = ${invoice.id} ORDER BY sort_order`) as unknown as BoInvoiceItem[]
    const customerRows = (await sql`SELECT * FROM bo_customers WHERE id = ${invoice.customer_id}`) as unknown as BoCustomer[]
    const orgRows = (await sql`SELECT * FROM bo_organizations WHERE id = ${invoice.organization_id}`) as unknown as BoOrganization[]
    const totals = computeTotals(
      items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unitPriceCents: i.unit_price_cents })),
      Number(invoice.tax_percent),
      { type: invoice.discount_type, value: Number(invoice.discount_value) }
    )

    return NextResponse.json({
      invoice: {
        type: invoice.type,
        number: invoice.number,
        status: invoice.status,
        currency: invoice.currency,
        taxPercent: Number(invoice.tax_percent),
        taxLabel: invoice.tax_label,
        discountType: invoice.discount_type,
        discountValue: Number(invoice.discount_value),
        notes: invoice.notes,
        dueDate: invoice.due_date,
        createdAt: invoice.created_at,
      },
      items: items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unitPriceCents: i.unit_price_cents })),
      totals,
      customer: customerRows[0] ? { name: customerRows[0].company_name || customerRows[0].contact_name, email: customerRows[0].email, address: customerRows[0].address } : null,
      org: orgRows[0] ? { name: orgRows[0].name, logoUrl: orgRows[0].branding_logo_url } : null,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
