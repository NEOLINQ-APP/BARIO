import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import type { BoAppointment } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// Business OS Phase 1 — minimal real scaffold, same shape as
// app/api/bario-one/crm/tasks/route.ts. Plain list + create, no calendar
// view, no reminders, no recurrence — that functionality is explicitly
// out of scope for this pass (see the plan's non-goals).
export async function GET(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const status = new URL(req.url).searchParams.get('status')
    const rows = (
      status
        ? await sql`
            SELECT a.*, c.contact_name FROM bo_appointments a
            LEFT JOIN bo_customers c ON c.id = a.customer_id
            WHERE a.organization_id = ${org.id} AND a.status = ${status}
            ORDER BY a.starts_at ASC
          `
        : await sql`
            SELECT a.*, c.contact_name FROM bo_appointments a
            LEFT JOIN bo_customers c ON c.id = a.customer_id
            WHERE a.organization_id = ${org.id}
            ORDER BY a.starts_at ASC
          `
    ) as unknown as (BoAppointment & { contact_name: string | null })[]

    return NextResponse.json({ appointments: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, user, org } = auth

    const { customerId, dealId, title, location, startsAt, endsAt, notes, assignedToUserId } = await req.json()
    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    const startsAtDate = new Date(startsAt)
    if (!startsAt || Number.isNaN(startsAtDate.getTime())) {
      return NextResponse.json({ error: 'A valid startsAt is required' }, { status: 400 })
    }

    if (customerId) {
      const rows = (await sql`SELECT id FROM bo_customers WHERE id = ${customerId} AND organization_id = ${org.id}`) as unknown[]
      if (rows.length === 0) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const id = randomUUID()
    await sql`
      INSERT INTO bo_appointments (id, organization_id, customer_id, deal_id, assigned_to_user_id, title, location, starts_at, ends_at, notes, created_by_user_id)
      VALUES (${id}, ${org.id}, ${customerId || null}, ${dealId || null}, ${assignedToUserId || user.id}, ${title.trim()}, ${location || null}, ${startsAt}, ${endsAt || null}, ${notes || null}, ${user.id})
    `
    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
