import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import type { BoVacationRequest } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  try {
    const auth = await requireBoModule('employees')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`
      SELECT v.*, e.name as employee_name FROM bo_vacation_requests v
      JOIN bo_employees e ON e.id = v.employee_id
      WHERE v.organization_id = ${org.id}
      ORDER BY v.created_at DESC
    `) as unknown as (BoVacationRequest & { employee_name: string })[]

    return NextResponse.json({ requests: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}

// Anyone in the org (including plain employees) can file a vacation
// request for a linked employee record — approving/denying is what's
// owner/admin-restricted (see [id]/route.ts), not the request itself.
export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('employees')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth

    const { employeeId, startDate, endDate, notes } = await req.json()
    if (!startDate || !endDate) return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 })
    if (new Date(endDate) < new Date(startDate)) return NextResponse.json({ error: 'End date must be on or after start date' }, { status: 400 })

    let resolvedEmployeeId = employeeId
    if (!resolvedEmployeeId) {
      const rows = (await sql`SELECT id FROM bo_employees WHERE user_id = ${membership.user_id} AND organization_id = ${org.id}`) as unknown as { id: string }[]
      if (!rows[0]) return NextResponse.json({ error: 'No employee record is linked to your account' }, { status: 400 })
      resolvedEmployeeId = rows[0].id
    } else if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can file a request for another employee' }, { status: 403 })
    }

    const employeeRows = (await sql`SELECT id FROM bo_employees WHERE id = ${resolvedEmployeeId} AND organization_id = ${org.id}`) as unknown[]
    if (employeeRows.length === 0) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    const id = randomUUID()
    await sql`
      INSERT INTO bo_vacation_requests (id, organization_id, employee_id, start_date, end_date, notes)
      VALUES (${id}, ${org.id}, ${resolvedEmployeeId}, ${startDate}, ${endDate}, ${notes || null})
    `
    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
