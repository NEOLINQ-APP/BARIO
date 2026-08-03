import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { db, type User, type InvoiceChangeRequest } from '@/lib/db'
import { insertNewInvoice, applyInvoiceUpdate } from '@/lib/invoiceMutations'
import { errorResponse } from '@/lib/errors'

// Session-only, deliberately — this is the one place a proposal from Amber
// (or any future finance-department agent) actually becomes a real
// invoice/price change, so decided_by must always be a real logged-in
// admin, never the BARIO_ADMIN_API_KEY server-to-server path other
// /api/admin/* routes accept.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const sql = await db()
  const userRows = (await sql`SELECT * FROM users WHERE id = ${session.userId}`) as unknown as User[]
  const user = userRows[0]
  if (!user?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json().catch(() => ({}))
    const action = body?.action === 'reject' ? 'reject' : body?.action === 'approve' ? 'approve' : null
    if (!action) return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 })

    const rows = (await sql`SELECT * FROM invoice_change_requests WHERE id = ${params.id}`) as unknown as InvoiceChangeRequest[]
    const request = rows[0]
    if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (request.status !== 'pending') return NextResponse.json({ error: `Already ${request.status}` }, { status: 409 })

    if (action === 'reject') {
      await sql`UPDATE invoice_change_requests SET status = 'rejected', decided_at = now(), decided_by = ${user.email} WHERE id = ${request.id}`
      return NextResponse.json({ ok: true, status: 'rejected' })
    }

    const payload = JSON.parse(request.payload_json)
    try {
      if (request.change_type === 'create') {
        const { id, number } = await insertNewInvoice(sql, payload)
        await sql`UPDATE invoice_change_requests SET status = 'approved', decided_at = now(), decided_by = ${user.email} WHERE id = ${request.id}`
        return NextResponse.json({ ok: true, status: 'approved', invoiceId: id, number })
      } else {
        await applyInvoiceUpdate(sql, request.invoice_id!, payload)
        await sql`UPDATE invoice_change_requests SET status = 'approved', decided_at = now(), decided_by = ${user.email} WHERE id = ${request.id}`
        return NextResponse.json({ ok: true, status: 'approved' })
      }
    } catch (applyErr: any) {
      // Approval itself didn't fail — applying the now-stale/invalid change
      // did (e.g. the invoice was deleted since Amber proposed this). Leave
      // the request pending with the error recorded rather than silently
      // marking it approved when nothing actually changed.
      await sql`UPDATE invoice_change_requests SET last_error = ${applyErr.message ?? String(applyErr)} WHERE id = ${request.id}`
      return NextResponse.json({ error: applyErr.message ?? 'Could not apply this change' }, { status: 422 })
    }
  } catch (err) {
    return errorResponse(err)
  }
}
