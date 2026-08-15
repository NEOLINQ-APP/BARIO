import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import { nextBoInvoiceNumber, newPublicToken } from '@/lib/barioOneInvoices'
import { triggerWebhooks } from '@/lib/barioOneWebhooks'
import type { BoInvoice, BoInvoiceItem } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// One-click estimate/quote -> invoice conversion. Clones the document +
// its line items (including product_id/unit_cost_cents) into a brand-new
// bo_invoices row rather than flipping `type` in place, since the source
// document should stay exactly as it was sent/accepted — same reasoning
// invoices never get their line items silently re-priced after the fact.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('invoicing')
    if (auth instanceof NextResponse) return auth
    const { sql, user, org } = auth

    const rows = (await sql`SELECT * FROM bo_invoices WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as BoInvoice[]
    const source = rows[0]
    if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (source.type !== 'estimate' && source.type !== 'quote') {
      return NextResponse.json({ error: 'Only estimates and quotes can be converted to an invoice' }, { status: 400 })
    }
    if (source.converted_to_invoice_id) {
      return NextResponse.json({ error: 'This document has already been converted to an invoice' }, { status: 400 })
    }

    const items = (await sql`SELECT * FROM bo_invoice_items WHERE invoice_id = ${source.id} ORDER BY sort_order`) as unknown as BoInvoiceItem[]

    const newId = randomUUID()
    const number = await nextBoInvoiceNumber(sql, org.id, 'invoice')
    const publicToken = newPublicToken()

    await sql.begin(async (tx: any) => {
      await tx`
        INSERT INTO bo_invoices (
          id, organization_id, customer_id, type, number, public_token,
          currency, tax_percent, tax_label, discount_type, discount_value, notes,
          created_by_user_id, converted_from_id
        )
        VALUES (
          ${newId}, ${org.id}, ${source.customer_id}, 'invoice', ${number}, ${publicToken},
          ${source.currency}, ${source.tax_percent}, ${source.tax_label}, ${source.discount_type}, ${source.discount_value}, ${source.notes},
          ${user.id}, ${source.id}
        )
      `
      let sortOrder = 0
      for (const item of items) {
        await tx`
          INSERT INTO bo_invoice_items (id, invoice_id, description, quantity, unit_price_cents, sort_order, product_id, unit_cost_cents)
          VALUES (${randomUUID()}, ${newId}, ${item.description}, ${item.quantity}, ${item.unit_price_cents}, ${sortOrder++}, ${item.product_id}, ${item.unit_cost_cents})
        `
      }
      await tx`UPDATE bo_invoices SET converted_to_invoice_id = ${newId}, updated_at = now() WHERE id = ${source.id}`
    })

    await triggerWebhooks(sql, org.id, 'invoice.created', { invoiceId: newId, number, customerId: source.customer_id })

    return NextResponse.json({ ok: true, id: newId, number })
  } catch (err: any) {
    return errorResponse(err)
  }
}
