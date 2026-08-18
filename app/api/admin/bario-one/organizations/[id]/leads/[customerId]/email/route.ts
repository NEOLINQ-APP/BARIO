import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/admin'
import { getCrmMailboxCreds, sendViaCrmMailbox } from '@/lib/barioOneCrmMailbox'
import { sendEmail } from '@/lib/email'
import type { BoCustomer, BoOrganization } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// Admin-Bearer equivalent of app/api/bario-one/crm/customers/[id]/email
// (which is session-gated to a logged-in Bario One member) -- same send
// logic, for the admin panel's per-lead reply box where there's no
// customer session, only an admin one.
export async function POST(req: Request, { params }: { params: { id: string; customerId: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const orgRows = (await sql`SELECT * FROM bo_organizations WHERE id = ${params.id}`) as unknown as BoOrganization[]
    const org = orgRows[0]
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

    const customerRows = (await sql`SELECT * FROM bo_customers WHERE id = ${params.customerId} AND organization_id = ${params.id}`) as unknown as BoCustomer[]
    const customer = customerRows[0]
    if (!customer) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    if (!customer.email) return NextResponse.json({ error: 'This lead has no email address on file' }, { status: 400 })

    const { subject, body } = await req.json()
    if (typeof subject !== 'string' || !subject.trim()) return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
    if (typeof body !== 'string' || !body.trim()) return NextResponse.json({ error: 'Message body is required' }, { status: 400 })

    const html = body.trim().replace(/\n/g, '<br/>')
    const creds = getCrmMailboxCreds(org)
    let messageId: string | null = null
    if (creds) {
      const result = await sendViaCrmMailbox(creds, { to: customer.email, subject: subject.trim(), html })
      messageId = result.messageId
    } else {
      await sendEmail(customer.email, subject.trim(), html)
    }

    await sql`
      INSERT INTO bo_notes (id, organization_id, customer_id, kind, body, direction, from_email, message_id)
      VALUES (${randomUUID()}, ${org.id}, ${customer.id}, 'email', ${`Subject: ${subject.trim()}\n\n${body.trim()}`}, 'outbound', ${creds?.email ?? null}, ${messageId})
    `
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
