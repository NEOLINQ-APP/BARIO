import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoMembership } from '@/lib/barioOne'
import type { BoCustomer } from '@/lib/db'
import { sendSms } from '@/lib/twilio'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { errorResponse } from '@/lib/errors'

// Sends from Bario's shared general-purpose number (same default sendSms()
// already uses for other products without their own dedicated Twilio
// number) — a per-org dedicated business number is real future work, not
// something to fake here.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, user, org } = auth

    const allowed = await rateLimit(sql, `bo-crm-sms:${org.id}`, 50, 3600)
    if (!allowed) return rateLimitResponse()

    const rows = (await sql`SELECT * FROM bo_customers WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as BoCustomer[]
    const customer = rows[0]
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    if (!customer.phone) return NextResponse.json({ error: 'This customer has no phone number on file' }, { status: 400 })

    const { body } = await req.json()
    if (typeof body !== 'string' || !body.trim()) return NextResponse.json({ error: 'Message body is required' }, { status: 400 })

    await sendSms(customer.phone, body.trim())

    await sql`
      INSERT INTO bo_notes (id, organization_id, customer_id, author_user_id, kind, body)
      VALUES (${randomUUID()}, ${org.id}, ${customer.id}, ${user.id}, 'sms', ${body.trim()})
    `
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
