import { NextResponse } from 'next/server'
import { isRecordVisibleToMember, requireBoModule } from '@/lib/barioOne'
import { matchProductsToLead } from '@/lib/businessMatching'
import { errorResponse } from '@/lib/errors'

export const maxDuration = 60

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth

    const rows = (await sql`SELECT assigned_to_user_id FROM bo_customers WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as { assigned_to_user_id: string | null }[]
    if (rows.length === 0 || !isRecordVisibleToMember(membership, rows[0].assigned_to_user_id)) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const result = await matchProductsToLead(sql, org.id, params.id)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ ok: true, matches: result.matches })
  } catch (err) {
    return errorResponse(err)
  }
}
