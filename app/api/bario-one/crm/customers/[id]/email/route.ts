import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { isRecordVisibleToMember, requireBoModule } from '@/lib/barioOne'
import { getCrmMailboxCreds, sendViaCrmMailbox } from '@/lib/barioOneCrmMailbox'
import type { BoCustomer } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { errorResponse } from '@/lib/errors'

// Sends an email to the customer. If the org has a CRM mailbox provisioned
// (lib/barioOneCrmMailbox.ts), sends FROM that real mailbox via SMTP so the
// customer's reply naturally lands back in the same inbox
// app/api/cron/crm-email-sync polls -- real two-way sync. Falls back to
// Bario's shared Resend identity (lib/email.ts) for an org with no
// mailbox provisioned yet, same one-way behavior as before.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, user, org, membership } = auth

    const allowed = await rateLimit(sql, `bo-crm-email:${org.id}`, 50, 3600)
    if (!allowed) return rateLimitResponse()

    const rows = (await sql`SELECT * FROM bo_customers WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as BoCustomer[]
    const customer = rows[0]
    if (!customer || !isRecordVisibleToMember(membership, customer.assigned_to_user_id)) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }
    if (!customer.email) return NextResponse.json({ error: 'This customer has no email address on file' }, { status: 400 })

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
      INSERT INTO bo_notes (id, organization_id, customer_id, author_user_id, kind, body, direction, from_email, message_id)
      VALUES (${randomUUID()}, ${org.id}, ${customer.id}, ${user.id}, 'email', ${`Subject: ${subject.trim()}\n\n${body.trim()}`}, 'outbound', ${creds?.email ?? null}, ${messageId})
    `
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
