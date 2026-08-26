import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireAdmin } from '@/lib/admin'
import { computeDisplayStatus } from '@/lib/barioPay'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const rows = (await sql`
      SELECT b.*, c.brand AS card_brand, c.last4 AS card_last4
      FROM bario_pay_bills b LEFT JOIN bario_pay_cards c ON c.id = b.card_id
      ORDER BY b.due_date ASC NULLS LAST, b.vendor ASC
    `) as unknown as { status: string; due_date: string | null }[]
    const bills = rows.map((b) => ({ ...b, display: computeDisplayStatus(b.status, b.due_date) }))
    return NextResponse.json({ ok: true, bills })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth
  try {
    const { vendor, serviceName, planOrModel, amountCents, currency, billingCycle, dueDate, status, notes, cardId } = await req.json()
    if (typeof vendor !== 'string' || !vendor.trim() || typeof serviceName !== 'string' || !serviceName.trim()) {
      return NextResponse.json({ error: 'Vendor and service name are required' }, { status: 400 })
    }
    if (typeof amountCents !== 'number' || amountCents < 0) {
      return NextResponse.json({ error: 'A valid amount is required' }, { status: 400 })
    }

    const id = randomUUID()
    await sql`
      INSERT INTO bario_pay_bills (id, vendor, service_name, plan_or_model, amount_cents, currency, billing_cycle, due_date, status, notes, card_id)
      VALUES (
        ${id}, ${vendor.trim()}, ${serviceName.trim()}, ${planOrModel || null}, ${amountCents},
        ${currency || 'CAD'}, ${billingCycle || 'monthly'}, ${dueDate || null}, ${status || 'active'}, ${notes || null}, ${cardId || null}
      )
    `
    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
