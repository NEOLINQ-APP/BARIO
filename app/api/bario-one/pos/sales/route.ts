import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
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
      LIMIT 200
    `) as unknown as (BoPosSale & { customer_name: string | null })[]

    return NextResponse.json({ sales: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}
