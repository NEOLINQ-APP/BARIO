import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import { toCsv } from '@/lib/csv'
import type { BoPosSale } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`
      SELECT s.*, c.contact_name as customer_name FROM bo_pos_sales s
      LEFT JOIN bo_customers c ON c.id = s.customer_id
      WHERE s.organization_id = ${org.id}
      ORDER BY s.created_at DESC
    `) as unknown as (BoPosSale & { customer_name: string | null })[]

    const csv = toCsv(
      rows.map((s) => ({
        customer: s.customer_name ?? 'Walk-in',
        total: (s.total_cents / 100).toFixed(2),
        tax: (s.tax_cents / 100).toFixed(2),
        discount: (s.discount_cents / 100).toFixed(2),
        payment_method: s.payment_method,
        status: s.status,
        created_at: s.created_at,
      })),
      [
        { key: 'customer', header: 'Customer' },
        { key: 'total', header: 'Total ($)' },
        { key: 'tax', header: 'Tax ($)' },
        { key: 'discount', header: 'Discount ($)' },
        { key: 'payment_method', header: 'Payment Method' },
        { key: 'status', header: 'Status' },
        { key: 'created_at', header: 'Date' },
      ]
    )

    return new NextResponse(csv, {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="sales.csv"' },
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
