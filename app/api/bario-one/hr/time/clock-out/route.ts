import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { resolveEmployeeForClockAction } from '@/lib/barioOneEmployees'
import type { BoTimeEntry } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('employees')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth

    const { employeeId } = await req.json().catch(() => ({ employeeId: undefined }))
    const resolved = await resolveEmployeeForClockAction(sql, org, membership, employeeId)
    if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

    const openRows = (await sql`
      SELECT * FROM bo_time_entries WHERE employee_id = ${resolved.employee.id} AND clock_out IS NULL ORDER BY clock_in DESC LIMIT 1
    `) as unknown as BoTimeEntry[]
    const open = openRows[0]
    if (!open) return NextResponse.json({ error: 'Not currently clocked in' }, { status: 400 })

    await sql`UPDATE bo_time_entries SET clock_out = now() WHERE id = ${open.id}`
    const rows = (await sql`SELECT * FROM bo_time_entries WHERE id = ${open.id}`) as unknown as BoTimeEntry[]

    return NextResponse.json({ ok: true, entry: rows[0] })
  } catch (err: any) {
    return errorResponse(err)
  }
}
