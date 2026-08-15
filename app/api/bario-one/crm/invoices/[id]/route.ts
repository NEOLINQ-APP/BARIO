import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import { computeTotals } from '@/lib/barioOneInvoices'
import type { BoInvoice, BoInvoiceItem, BoCustomer } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('invoicing')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`SELECT * FROM bo_invoices WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as BoInvoice[]
    const invoice = rows[0]
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const items = (await sql`SELECT * FROM bo_invoice_items WHERE invoice_id = ${invoice.id} ORDER BY sort_order`) as unknown as BoInvoiceItem[]
    const customerRows = (await sql`SELECT * FROM bo_customers WHERE id = ${invoice.customer_id}`) as unknown as BoCustomer[]
    const totals = computeTotals(
      items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unitPriceCents: i.unit_price_cents })),
      Number(invoice.tax_percent),
      { type: invoice.discount_type, value: Number(invoice.discount_value) }
    )

    return NextResponse.json({ invoice, items, customer: customerRows[0] ?? null, totals })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('invoicing')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const existing = (await sql`SELECT id, status FROM bo_invoices WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as { id: string; status: string }[]
    if (existing.length === 0) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    if (existing[0].status === 'void') return NextResponse.json({ error: 'This document has been voided and can no longer be edited' }, { status: 400 })

    const { items, taxPercent, taxLabel, discountType, discountValue, notes, dueDate } = await req.json()

    await sql.begin(async (tx: any) => {
      await tx`
        UPDATE bo_invoices SET
          tax_percent = COALESCE(${Number.isFinite(taxPercent) ? taxPercent : null}, tax_percent),
          tax_label = COALESCE(${taxLabel || null}, tax_label),
          discount_type = COALESCE(${['none', 'percent', 'fixed'].includes(discountType) ? discountType : null}, discount_type),
          discount_value = COALESCE(${Number.isFinite(discountValue) ? discountValue : null}, discount_value),
          notes = COALESCE(${notes ?? null}, notes),
          due_date = COALESCE(${dueDate || null}, due_date),
          updated_at = now()
        WHERE id = ${params.id} AND organization_id = ${org.id}
      `
      if (Array.isArray(items) && items.length > 0) {
        const productIds = Array.from(new Set(items.map((i: any) => i.productId).filter((id: any) => typeof id === 'string')))
        const productCostById = new Map<string, number>()
        if (productIds.length > 0) {
          const productRows = (await tx`
            SELECT id, cost_cents FROM bo_products WHERE organization_id = ${org.id} AND id = ANY(${productIds})
          `) as unknown as { id: string; cost_cents: number }[]
          for (const p of productRows) productCostById.set(p.id, p.cost_cents)
        }

        await tx`DELETE FROM bo_invoice_items WHERE invoice_id = ${params.id}`
        let sortOrder = 0
        for (const item of items) {
          const productId = typeof item.productId === 'string' && productCostById.has(item.productId) ? item.productId : null
          const unitCostCents = productId ? productCostById.get(productId)! : 0
          await tx`
            INSERT INTO bo_invoice_items (id, invoice_id, description, quantity, unit_price_cents, sort_order, product_id, unit_cost_cents)
            VALUES (${randomUUID()}, ${params.id}, ${String(item.description).trim()}, ${Number(item.quantity) || 1}, ${Math.round(Number(item.unitPriceCents) || 0)}, ${sortOrder++}, ${productId}, ${unitCostCents})
          `
        }
      }
    })

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
      return NextResponse.json({ error: 'Only owners and admins can delete documents' }, { status: 403 })
    }

    await sql`DELETE FROM bo_invoices WHERE id = ${params.id} AND organization_id = ${org.id}`
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
