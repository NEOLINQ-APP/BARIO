import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// Marks a filed request reviewed — status is purely a record-keeping label
// here (approved/denied/pending_review); the actual refund still happens
// wherever refunds actually happen today (Stripe dashboard/admin billing
// tools), never through this route. This never moves money.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const body = await req.json().catch(() => ({}))
    const status = typeof body?.status === 'string' ? body.status.trim() : ''
    if (!['pending_review', 'approved', 'denied'].includes(status)) {
      return NextResponse.json({ error: 'status must be pending_review, approved, or denied' }, { status: 400 })
    }
    await sql`UPDATE refund_requests SET status = ${status} WHERE id = ${params.id}`
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
