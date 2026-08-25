import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const orgs = await sql`
      SELECT id, name, slug, owner_user_id, plan, subscription_status, stripe_customer_id, stripe_subscription_id, trial_ends_at, enabled_modules_json
      FROM bo_organizations WHERE id = '0bdf0a6f-81a9-4900-a14d-9601423b9c1c'
    `
    return NextResponse.json({ ok: true, orgs })
  } catch (err: any) {
    return errorResponse(err)
  }
}
