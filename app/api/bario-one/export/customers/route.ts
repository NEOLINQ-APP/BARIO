import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { toCsv } from '@/lib/csv'
import type { BoCustomer } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  try {
    // Gated on 'crm' (not 'api_webhooks') -- this route now has a real UI
    // entry point on the CRM customers page, and an org with CRM but not
    // the separate API/Webhooks add-on shouldn't 403 trying to export its
    // own customer list.
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth

    // Same record-level scoping as the list route -- otherwise an employee
    // could use "Export CSV" to bypass assignment-based visibility and
    // dump the whole org's customer list.
    const employeeScope = membership.role === 'employee'
    const rows = (await sql`
      SELECT * FROM bo_customers
      WHERE organization_id = ${org.id}
        AND (NOT ${employeeScope} OR assigned_to_user_id IS NULL OR assigned_to_user_id = ${membership.user_id})
      ORDER BY created_at DESC
    `) as unknown as BoCustomer[]
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
