import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

// "See where my company vehicle is at all times" — owner/admin-only live
// view of every employee's latest ping, joined with whatever appointment
// they're currently on (if any) so the map can show "en route to..." /
// "arrived at..." rather than a bare pin.
export async function GET(req: Request) {
  try {
    const auth = await requireBoModule('employees')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return NextResponse.json({ error: 'Only owners/admins can view the live tracking map' }, { status: 403 })
    }

    const rows = await sql`
      SELECT
        e.id AS employee_id, e.name AS employee_name,
        dl.lat, dl.lng, dl.accuracy_meters, dl.updated_at,
        a.id AS appointment_id, a.title AS appointment_title, a.location AS appointment_location,
        a.arrived_at, a.status AS appointment_status
      FROM bo_driver_locations dl
      JOIN bo_employees e ON e.id = dl.employee_id
      LEFT JOIN bo_appointments a ON a.id = dl.appointment_id
      WHERE dl.organization_id = ${org.id}
      ORDER BY dl.updated_at DESC
    `

    return NextResponse.json({ ok: true, drivers: rows })
  } catch (err) {
    return errorResponse(err)
  }
}
