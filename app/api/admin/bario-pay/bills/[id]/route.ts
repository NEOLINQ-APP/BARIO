import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const body = await req.json()
    const existingRows = await sql`SELECT * FROM bario_pay_bills WHERE id = ${params.id}`
    const existing = existingRows[0] as any
    if (!existing) return NextResponse.json({ error: 'Bill not found' }, { status: 404 })

    const next = {
      vendor: typeof body.vendor === 'string' ? body.vendor.trim() : existing.vendor,
      serviceName: typeof body.serviceName === 'string' ? body.serviceName.trim() : existing.service_name,
      planOrModel: body.planOrModel !== undefined ? body.planOrModel : existing.plan_or_model,
      amountCents: typeof body.amountCents === 'number' ? body.amountCents : existing.amount_cents,
      currency: body.currency ?? existing.currency,
      billingCycle: body.billingCycle ?? existing.billing_cycle,
      dueDate: body.dueDate !== undefined ? body.dueDate : existing.due_date,
      status: body.status ?? existing.status,
      notes: body.notes !== undefined ? body.notes : existing.notes,
      cardId: body.cardId !== undefined ? body.cardId : existing.card_id,
      lastPaidAt: existing.last_paid_at,
    }
    if (body.markPaid) next.lastPaidAt = new Date().toISOString()

    await sql`
      UPDATE bario_pay_bills SET
        vendor = ${next.vendor}, service_name = ${next.serviceName}, plan_or_model = ${next.planOrModel},
        amount_cents = ${next.amountCents}, currency = ${next.currency}, billing_cycle = ${next.billingCycle},
        due_date = ${next.dueDate}, status = ${next.status}, notes = ${next.notes}, card_id = ${next.cardId},
        last_paid_at = ${next.lastPaidAt}, updated_at = now()
      WHERE id = ${params.id}
    `
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    await sql`DELETE FROM bario_pay_bills WHERE id = ${params.id}`
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
