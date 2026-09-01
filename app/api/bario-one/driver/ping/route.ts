import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import { geocodeAddress, hasArrived } from '@/lib/driverArrival'
import { errorResponse } from '@/lib/errors'
import type { BoAppointment, BoEmployee } from '@/lib/db'

// A logged-in employee's browser calls this repeatedly (every ~20s) while
// "sharing location" is on for an active job — see components/
// BarioOneTracking.tsx. Upserts their one latest-position row (no history
// table, see bo_driver_locations' own comment in lib/db.ts) and, the first
// time a ping lands within the geofence radius of the job's address, marks
// arrived_at for real — not a manual button, an actual GPS-verified event.
export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('employees')
    if (auth instanceof NextResponse) return auth
    const { sql, org, user } = auth

    const body = await req.json()
    const appointmentId = typeof body?.appointmentId === 'string' ? body.appointmentId : null
    const lat = typeof body?.lat === 'number' ? body.lat : null
    const lng = typeof body?.lng === 'number' ? body.lng : null
    const accuracy = typeof body?.accuracy === 'number' ? body.accuracy : null
    if (!appointmentId || lat == null || lng == null) {
      return NextResponse.json({ error: 'appointmentId, lat, and lng are required' }, { status: 400 })
    }

    const employeeRows = (await sql`
      SELECT * FROM bo_employees WHERE organization_id = ${org.id} AND user_id = ${user.id} LIMIT 1
    `) as unknown as BoEmployee[]
    const employee = employeeRows[0]
    if (!employee) return NextResponse.json({ error: 'No employee profile found for your account in this org' }, { status: 403 })

    const apptRows = (await sql`
      SELECT * FROM bo_appointments WHERE id = ${appointmentId} AND organization_id = ${org.id}
    `) as unknown as BoAppointment[]
    const appointment = apptRows[0]
    if (!appointment) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })

    await sql`
      INSERT INTO bo_driver_locations (employee_id, organization_id, appointment_id, lat, lng, accuracy_meters, updated_at)
      VALUES (${employee.id}, ${org.id}, ${appointmentId}, ${lat}, ${lng}, ${accuracy}, now())
      ON CONFLICT (employee_id) DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        appointment_id = EXCLUDED.appointment_id,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        accuracy_meters = EXCLUDED.accuracy_meters,
        updated_at = now()
    `

    let justArrived = false
    if (!appointment.arrived_at && appointment.location) {
      let serviceLat = appointment.service_lat
      let serviceLng = appointment.service_lng
      if (serviceLat == null || serviceLng == null) {
        const geocoded = await geocodeAddress(appointment.location)
        if (geocoded) {
          serviceLat = geocoded.lat
          serviceLng = geocoded.lng
          await sql`UPDATE bo_appointments SET service_lat = ${serviceLat}, service_lng = ${serviceLng} WHERE id = ${appointmentId}`
        }
      }
      if (serviceLat != null && serviceLng != null && hasArrived(lat, lng, serviceLat, serviceLng)) {
        await sql`UPDATE bo_appointments SET arrived_at = now() WHERE id = ${appointmentId}`
        justArrived = true
        if (appointment.customer_id) {
          await sql`
            INSERT INTO bo_notes (id, organization_id, customer_id, kind, body)
            VALUES (${randomUUID()}, ${org.id}, ${appointment.customer_id}, 'note', ${`${employee.name} arrived on site for "${appointment.title}" (GPS-verified).`})
          `
        }
      }
    }

    return NextResponse.json({ ok: true, justArrived })
  } catch (err) {
    return errorResponse(err)
  }
}
