import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

// Also how the "review & confirm" step works: PATCH with just
// { status: 'confirmed' } after the user has checked/edited the
// OCR-extracted fields.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('invoicing')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const existing = (await sql`SELECT id FROM bo_expenses WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown[]
    if (existing.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { vendor, category, amountCents, taxCents, expenseDate, notes, status } = await req.json()

    await sql`
      UPDATE bo_expenses SET
        vendor = COALESCE(${vendor ?? null}, vendor),
        category = COALESCE(${category || null}, category),
        amount_cents = COALESCE(${Number.isFinite(amountCents) ? Math.round(amountCents) : null}, amount_cents),
        tax_cents = COALESCE(${Number.isFinite(taxCents) ? Math.round(taxCents) : null}, tax_cents),
        expense_date = COALESCE(${expenseDate || null}, expense_date),
        notes = COALESCE(${notes ?? null}, notes),
        status = COALESCE(${status === 'confirmed' || status === 'needs_review' ? status : null}, status),
        updated_at = now()
      WHERE id = ${params.id} AND organization_id = ${org.id}
    `
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('invoicing')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can delete expenses' }, { status: 403 })
    }

    await sql`DELETE FROM bo_expenses WHERE id = ${params.id} AND organization_id = ${org.id}`
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
