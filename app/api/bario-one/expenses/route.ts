import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import type { BoExpense } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  try {
    const auth = await requireBoModule('invoicing')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const url = new URL(req.url)
    const status = url.searchParams.get('status')

    const rows = (status === 'needs_review' || status === 'confirmed'
      ? await sql`SELECT * FROM bo_expenses WHERE organization_id = ${org.id} AND status = ${status} ORDER BY expense_date DESC NULLS LAST, created_at DESC`
      : await sql`SELECT * FROM bo_expenses WHERE organization_id = ${org.id} ORDER BY expense_date DESC NULLS LAST, created_at DESC`) as unknown as BoExpense[]

    return NextResponse.json({ expenses: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}

// Manual entry — always status='confirmed' immediately, unlike the
// receipt-scan path which lands as 'needs_review' pending user confirmation.
export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('invoicing')
    if (auth instanceof NextResponse) return auth
    const { sql, user, org } = auth

    const { vendor, category, amountCents, taxCents, expenseDate, notes } = await req.json()
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: 'amountCents must be a positive number' }, { status: 400 })
    }

    const id = randomUUID()
    await sql`
      INSERT INTO bo_expenses (id, organization_id, vendor, category, amount_cents, tax_cents, expense_date, notes, status, created_by_user_id)
      VALUES (
        ${id}, ${org.id}, ${vendor || null}, ${category || 'uncategorized'},
        ${Math.round(amountCents)}, ${Number.isFinite(taxCents) ? Math.round(taxCents) : 0},
        ${expenseDate || null}, ${notes || null}, 'confirmed', ${user.id}
      )
    `
    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
