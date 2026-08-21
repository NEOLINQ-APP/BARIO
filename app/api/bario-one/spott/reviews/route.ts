import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'
import type { SpottReview } from '@/lib/db'

export async function GET() {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`SELECT * FROM spott_reviews WHERE organization_id = ${org.id} ORDER BY created_at DESC LIMIT 200`) as unknown as SpottReview[]
    return NextResponse.json({ reviews: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}
