import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import { toCsv } from '@/lib/csv'
import type { BoCustomer } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`SELECT * FROM bo_customers WHERE organization_id = ${org.id} ORDER BY created_at DESC`) as unknown as BoCustomer[]
    const csv = toCsv(
      rows.map((c) => ({ ...c, tags: JSON.parse(c.tags_json).join('; ') })),
      [
        { key: 'contact_name', header: 'Contact Name' },
        { key: 'company_name', header: 'Company Name' },
        { key: 'email', header: 'Email' },
        { key: 'phone', header: 'Phone' },
        { key: 'address', header: 'Address' },
        { key: 'tags', header: 'Tags' },
        { key: 'loyalty_points', header: 'Loyalty Points' },
        { key: 'created_at', header: 'Created At' },
      ]
    )

    return new NextResponse(csv, {
      headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="customers.csv"' },
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
