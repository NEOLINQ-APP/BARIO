import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const orgs = await sql`SELECT id, name, slug, owner_user_id, plan, subscription_status, enabled_modules_json FROM bo_organizations WHERE name ILIKE '%spott%' OR slug ILIKE '%spott%'`
    return NextResponse.json({ ok: true, orgs })
  } catch (err: any) {
    return errorResponse(err)
  }
}
