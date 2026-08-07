import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { confirmBoInvoicePayment } from '@/lib/barioOnePayments'
import type { BoInvoice, BoOrganization } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// Called by the public invoice page right after Stripe redirects back with
// ?session_id=... — never trusts that query param alone (a customer could
// hand-craft ?paid=1 in the URL bar), always re-verifies the session's
// real payment_status directly against Stripe first.
export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const { sessionId } = await req.json()
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      return NextResponse.json({ error: 'Missing session id' }, { status: 400 })
    }

    const sql = await db()
    const rows = (await sql`SELECT * FROM bo_invoices WHERE public_token = ${params.token}`) as unknown as BoInvoice[]
    const invoice = rows[0]
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const orgRows = (await sql`SELECT * FROM bo_organizations WHERE id = ${invoice.organization_id}`) as unknown as BoOrganization[]
    const org = orgRows[0]
    if (!org) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const confirmed = await confirmBoInvoicePayment(sql, org, invoice, sessionId.trim())
    return NextResponse.json({ ok: true, paid: confirmed })
  } catch (err: any) {
    return errorResponse(err)
  }
}
