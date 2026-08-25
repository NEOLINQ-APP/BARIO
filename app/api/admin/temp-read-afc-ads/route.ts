import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const rows = await sql`SELECT * FROM bo_ad_campaigns WHERE organization_id = 'db97fd81-faee-4489-af7e-3bb813886c53' ORDER BY created_at`
    return NextResponse.json({ ok: true, campaigns: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}
