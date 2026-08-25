import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

const SPOTT_ORG_ID = '0bdf0a6f-81a9-4900-a14d-9601423b9c1c'
const ALL_MODULES = ['crm', 'invoicing', 'payments', 'employees', 'payroll', 'pos', 'ai_assistant', 'api_webhooks']

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const rows = await sql`
      UPDATE bo_organizations SET
        plan = 'business',
        subscription_status = 'active',
        enabled_modules_json = ${JSON.stringify(ALL_MODULES)},
        updated_at = now()
      WHERE id = ${SPOTT_ORG_ID}
      RETURNING id, name, plan, subscription_status, enabled_modules_json
    `
    return NextResponse.json({ ok: true, org: rows[0] })
  } catch (err: any) {
    return errorResponse(err)
  }
}
