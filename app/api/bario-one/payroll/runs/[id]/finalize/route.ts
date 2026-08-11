import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

// Locking a pay run doesn't move any money — Bario One doesn't run real
// bank direct-deposit yet — it just freezes the numbers so a business can
// treat this as their official record for the period (referenced by real
// pay stubs handed to real employees) without them silently changing if
// hours or tax tables are edited later.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('payroll')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can finalize payroll' }, { status: 403 })
    }

    const rows = (await sql`SELECT status FROM bo_pay_runs WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as { status: string }[]
    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (rows[0].status === 'finalized') return NextResponse.json({ error: 'Already finalized' }, { status: 400 })

    await sql`UPDATE bo_pay_runs SET status = 'finalized', updated_at = now() WHERE id = ${params.id} AND organization_id = ${org.id}`
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
