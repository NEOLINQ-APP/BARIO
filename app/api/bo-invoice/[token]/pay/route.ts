import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createBoInvoicePaymentSession } from '@/lib/barioOnePayments'
import type { BoInvoice, BoInvoiceItem, BoCustomer, BoOrganization } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const sql = await db()
    const rows = (await sql`SELECT * FROM bo_invoices WHERE public_token = ${params.token}`) as unknown as BoInvoice[]
    const invoice = rows[0]
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (invoice.type !== 'invoice') return NextResponse.json({ error: 'Estimates and quotes cannot be paid directly' }, { status: 400 })
    if (invoice.status === 'paid') return NextResponse.json({ error: 'This invoice is already paid' }, { status: 409 })
    if (invoice.status === 'void') return NextResponse.json({ error: 'This invoice has been voided' }, { status: 409 })

    const orgRows = (await sql`SELECT * FROM bo_organizations WHERE id = ${invoice.organization_id}`) as unknown as BoOrganization[]
    const org = orgRows[0]
    if (!org || org.stripe_connect_status !== 'active') {
      return NextResponse.json({ error: 'Online payment is not set up for this business yet' }, { status: 400 })
    }

    const items = (await sql`SELECT * FROM bo_invoice_items WHERE invoice_id = ${invoice.id} ORDER BY sort_order`) as unknown as BoInvoiceItem[]
    const customerRows = (await sql`SELECT * FROM bo_customers WHERE id = ${invoice.customer_id}`) as unknown as BoCustomer[]

    const origin = req.headers.get('origin') ?? 'https://www.bario.ca'
    const url = await createBoInvoicePaymentSession(org, invoice, items, customerRows[0]?.email ?? null, origin)

    return NextResponse.json({ ok: true, url })
  } catch (err: any) {
    return errorResponse(err)
  }
}
