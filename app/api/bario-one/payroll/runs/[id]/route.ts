import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { PROVINCE_NAMES } from '@/lib/barioOnePayroll'
import type { ProvinceKey } from '@/lib/payrollTaxTables2026'
import type { BoPayRun, BoPayStub } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('payroll')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`SELECT * FROM bo_pay_runs WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as BoPayRun[]
    const payRun = rows[0]
    if (!payRun) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const stubs = (await sql`
      SELECT s.*, e.name as employee_name FROM bo_pay_stubs s
      JOIN bo_employees e ON e.id = s.employee_id
      WHERE s.pay_run_id = ${params.id}
      ORDER BY e.name
    `) as unknown as (BoPayStub & { employee_name: string })[]

    return NextResponse.json({
      payRun,
      stubs: stubs.map((s) => ({ ...s, provinceName: PROVINCE_NAMES[s.province as ProvinceKey] ?? s.province })),
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('payroll')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can delete a pay run' }, { status: 403 })
    }

    const rows = (await sql`SELECT status FROM bo_pay_runs WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as { status: string }[]
    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (rows[0].status === 'finalized') return NextResponse.json({ error: 'A finalized pay run cannot be deleted' }, { status: 400 })

    await sql`DELETE FROM bo_pay_runs WHERE id = ${params.id} AND organization_id = ${org.id}`
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
