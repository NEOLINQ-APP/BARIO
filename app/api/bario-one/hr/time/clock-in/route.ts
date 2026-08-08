import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoMembership } from '@/lib/barioOne'
import { resolveEmployeeForClockAction } from '@/lib/barioOneEmployees'
import type { BoTimeEntry } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth

    const { employeeId } = await req.json().catch(() => ({ employeeId: undefined }))
    const resolved = await resolveEmployeeForClockAction(sql, org, membership, employeeId)
    if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

    const open = (await sql`SELECT id FROM bo_time_entries WHERE employee_id = ${resolved.employee.id} AND clock_out IS NULL`) as unknown[]
    if (open.length > 0) return NextResponse.json({ error: 'Already clocked in' }, { status: 400 })

    const id = randomUUID()
    await sql`INSERT INTO bo_time_entries (id, organization_id, employee_id, clock_in) VALUES (${id}, ${org.id}, ${resolved.employee.id}, now())`
    const rows = (await sql`SELECT * FROM bo_time_entries WHERE id = ${id}`) as unknown as BoTimeEntry[]

    return NextResponse.json({ ok: true, entry: rows[0] })
  } catch (err: any) {
    return errorResponse(err)
  }
}
