import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// Manual override for payment received outside Stripe (e-transfer, cheque,
// cash) — the Stripe webhook is the other, automatic path to 'paid'
// (app/api/webhooks/stripe/route.ts, invoiceId branch).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`SELECT status FROM invoices WHERE id = ${params.id}`) as unknown as { status: string }[]
    if (!rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (rows[0].status === 'void') return NextResponse.json({ error: 'Cannot mark a voided invoice as paid' }, { status: 409 })

    await sql`UPDATE invoices SET status = 'paid', paid_at = now(), updated_at = now() WHERE id = ${params.id}`
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
