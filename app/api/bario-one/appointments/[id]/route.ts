import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

const VALID_STATUSES = ['scheduled', 'completed', 'canceled', 'no_show']

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const existing = (await sql`SELECT id FROM bo_appointments WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown[]
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
