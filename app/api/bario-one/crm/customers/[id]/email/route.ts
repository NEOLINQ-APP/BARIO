import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoMembership } from '@/lib/barioOne'
import type { BoCustomer } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { errorResponse } from '@/lib/errors'

// Sends an email to the customer FROM Bario's own shared sending identity
// (same lib/email.ts every other product here uses) and logs it into
// bo_notes as part of the customer's history. This is deliberately a
// one-way "send", not a threaded inbox — a real reply-tracking inbox is a
// materially bigger feature (inbound webhook parsing, thread UI) left for
// a later pass rather than half-built now.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, user, org } = auth

    const allowed = await rateLimit(sql, `bo-crm-email:${org.id}`, 50, 3600)
    if (!allowed) return rateLimitResponse()

    const rows = (await sql`SELECT * FROM bo_customers WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as BoCustomer[]
    const customer = rows[0]
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    if (!customer.email) return NextResponse.json({ error: 'This customer has no email address on file' }, { status: 400 })

    const { subject, body } = await req.json()
    if (typeof subject !== 'string' || !subject.trim()) return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
    if (typeof body !== 'string' || !body.trim()) return NextResponse.json({ error: 'Message body is required' }, { status: 400 })

    await sendEmail(customer.email, subject.trim(), body.trim().replace(/\n/g, '<br/>'))

    await sql`
      INSERT INTO bo_notes (id, organization_id, customer_id, author_user_id, kind, body)
      VALUES (${randomUUID()}, ${org.id}, ${customer.id}, ${user.id}, 'email', ${`Subject: ${subject.trim()}\n\n${body.trim()}`})
    `
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
