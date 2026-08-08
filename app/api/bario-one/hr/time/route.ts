import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import type { BoEmployee, BoTimeEntry } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// Every employee with their current clocked-in status (if any) plus their
// most recent entries — the "who's on the clock right now" view.
export async function GET() {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth

    const employees = (await sql`SELECT * FROM bo_employees WHERE organization_id = ${org.id} AND status = 'active' ORDER BY name`) as unknown as BoEmployee[]
    const openEntries = (await sql`
      SELECT * FROM bo_time_entries WHERE organization_id = ${org.id} AND clock_out IS NULL
    `) as unknown as BoTimeEntry[]
    const openByEmployee = new Map(openEntries.map((e) => [e.employee_id, e]))

    const myEmployeeRows = (await sql`SELECT id FROM bo_employees WHERE user_id = ${membership.user_id} AND organization_id = ${org.id}`) as unknown as { id: string }[]

    return NextResponse.json({
      employees: employees.map((e) => ({ id: e.id, name: e.name, clockedIn: openByEmployee.has(e.id), clockInAt: openByEmployee.get(e.id)?.clock_in ?? null })),
      myEmployeeId: myEmployeeRows[0]?.id ?? null,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
