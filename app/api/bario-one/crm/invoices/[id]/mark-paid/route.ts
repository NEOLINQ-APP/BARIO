import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

// Manual "mark as paid" — real payment collection (Stripe, deposited to
// the tenant business's own bank account) is Bario Payments (Phase 4),
// which needs per-business Stripe Connect onboarding, a materially bigger
// integration. Plenty of real small businesses take e-transfer/cheque/cash
// today, so this alone is a genuine, complete feature on its own — not a
// stand-in for the real thing.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const existing = (await sql`SELECT id, type FROM bo_invoices WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as { id: string; type: string }[]
    if (existing.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (existing[0].type !== 'invoice') return NextResponse.json({ error: 'Only invoices can be marked paid' }, { status: 400 })

    await sql`UPDATE bo_invoices SET status = 'paid', paid_at = now(), updated_at = now() WHERE id = ${params.id} AND organization_id = ${org.id}`
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
