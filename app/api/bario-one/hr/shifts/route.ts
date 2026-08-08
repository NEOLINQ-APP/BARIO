import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoMembership } from '@/lib/barioOne'
import type { BoShift } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`
      SELECT s.*, e.name as employee_name FROM bo_shifts s
      JOIN bo_employees e ON e.id = s.employee_id
      WHERE s.organization_id = ${org.id} AND s.starts_at > now() - interval '7 days'
      ORDER BY s.starts_at ASC
    `) as unknown as (BoShift & { employee_name: string })[]

    return NextResponse.json({ shifts: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can schedule shifts' }, { status: 403 })
    }

    const { employeeId, startsAt, endsAt, notes } = await req.json()
    if (typeof employeeId !== 'string' || !employeeId.trim()) return NextResponse.json({ error: 'employeeId is required' }, { status: 400 })
    if (!startsAt || !endsAt) return NextResponse.json({ error: 'startsAt and endsAt are required' }, { status: 400 })
    if (new Date(endsAt) <= new Date(startsAt)) return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 })

    const employeeRows = (await sql`SELECT id FROM bo_employees WHERE id = ${employeeId} AND organization_id = ${org.id}`) as unknown[]
    if (employeeRows.length === 0) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

    const id = randomUUID()
    await sql`
      INSERT INTO bo_shifts (id, organization_id, employee_id, starts_at, ends_at, notes)
      VALUES (${id}, ${org.id}, ${employeeId}, ${startsAt}, ${endsAt}, ${notes || null})
    `
    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
