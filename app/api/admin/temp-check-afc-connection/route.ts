import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const rows = await sql`
      SELECT organization_id, google_ads_customer_id, connected_by_user_id, connected_at
      FROM bo_google_ads_connections WHERE organization_id = 'db97fd81-faee-4489-af7e-3bb813886c53'
    `
    return NextResponse.json({ ok: true, connections: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}
