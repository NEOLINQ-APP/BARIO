import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { triggerWebhooks } from '@/lib/barioOneWebhooks'
import { runAutomations } from '@/lib/barioOneAutomations'
import { errorResponse } from '@/lib/errors'

const VALID_STATUSES = ['scheduled', 'completed', 'canceled', 'no_show']

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const existing = (await sql`SELECT id, status, customer_id FROM bo_appointments WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as { id: string; status: string; customer_id: string | null }[]
    if (existing.length === 0) return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })

    const { status, title, location, startsAt, endsAt, notes } = await req.json()
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    await sql`
      UPDATE bo_appointments SET
        status = COALESCE(${status || null}, status),
        title = COALESCE(${title || null}, title),
        location = COALESCE(${location || null}, location),
        starts_at = COALESCE(${startsAt || null}, starts_at),
        ends_at = COALESCE(${endsAt || null}, ends_at),
        notes = COALESCE(${notes || null}, notes),
        updated_at = now()
      WHERE id = ${params.id} AND organization_id = ${org.id}
    `
    // Business OS Step 9 — real call site, fires only on the actual
    // transition into 'completed', not on every unrelated edit.
    if (status === 'completed' && existing[0].status !== 'completed') {
      await triggerWebhooks(sql, org.id, 'appointment.completed', { appointmentId: params.id, customerId: existing[0].customer_id })
      await runAutomations(sql, org.id, 'appointment.completed', { customerId: existing[0].customer_id || undefined })
    }
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    await sql`DELETE FROM bo_appointments WHERE id = ${params.id} AND organization_id = ${org.id}`
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
