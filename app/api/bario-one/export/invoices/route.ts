import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import { computeTotals } from '@/lib/barioOneInvoices'
import { toCsv } from '@/lib/csv'
import type { BoInvoice, BoInvoiceItem } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const invoices = (await sql`
      SELECT i.*, c.contact_name, c.company_name FROM bo_invoices i
      JOIN bo_customers c ON c.id = i.customer_id
      WHERE i.organization_id = ${org.id}
      ORDER BY i.created_at DESC
    `) as unknown as (BoInvoice & { contact_name: string; company_name: string | null })[]

    const rows = []
    for (const inv of invoices) {
      const items = (await sql`SELECT * FROM bo_invoice_items WHERE invoice_id = ${inv.id}`) as unknown as BoInvoiceItem[]
      const totals = computeTotals(
        items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unitPriceCents: i.unit_price_cents })),
        Number(inv.tax_percent),
        { type: inv.discount_type, value: Number(inv.discount_value) }
      )
      rows.push({
        number: inv.number,
        type: inv.type,
        status: inv.status,
        customer: inv.company_name || inv.contact_name,
        total: (totals.totalCents / 100).toFixed(2),
        due_date: inv.due_date ?? '',
        paid_at: inv.paid_at ?? '',
        created_at: inv.created_at,
      })
    }

    const csv = toCsv(rows, [
      { key: 'number', header: 'Invoice Number' },
      { key: 'type', header: 'Type' },
      { key: 'status', header: 'Status' },
      { key: 'customer', header: 'Customer' },
      { key: 'total', header: 'Total ($)' },
      { key: 'due_date', header: 'Due Date' },
      { key: 'paid_at', header: 'Paid At' },
      { key: 'created_at', header: 'Created At' },
    ])

    return new NextResponse(csv, {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="invoices.csv"' },
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
