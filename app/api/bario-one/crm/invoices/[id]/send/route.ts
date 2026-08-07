import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import { sendEmail } from '@/lib/email'
import type { BoInvoice, BoCustomer } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`SELECT * FROM bo_invoices WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as BoInvoice[]
    const invoice = rows[0]
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const customerRows = (await sql`SELECT * FROM bo_customers WHERE id = ${invoice.customer_id}`) as unknown as BoCustomer[]
    const customer = customerRows[0]
    if (!customer?.email) return NextResponse.json({ error: 'This customer has no email address on file' }, { status: 400 })

    const origin = req.headers.get('origin') ?? 'https://bario.ca'
    const viewUrl = `${origin}/bo-invoice/${invoice.public_token}`

    await sendEmail(
      customer.email,
      `${org.name} sent you ${invoice.type === 'invoice' ? 'an invoice' : `a ${invoice.type}`} — ${invoice.number}`,
      `<p>${org.name} sent you ${invoice.type === 'invoice' ? 'an invoice' : `a ${invoice.type}`}, <strong>${invoice.number}</strong>.</p>
       <p><a href="${viewUrl}">View ${invoice.type}</a></p>`
    )

    await sql`UPDATE bo_invoices SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = ${params.id} AND organization_id = ${org.id} AND status = 'draft'`

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
