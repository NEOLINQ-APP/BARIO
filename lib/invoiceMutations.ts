import { randomUUID } from 'node:crypto'
import { nextInvoiceNumber } from '@/lib/invoices'

export type LineItemBody = { description: string; quantity: number; unitPriceCents: number }

export type InvoiceFields = {
  type?: 'invoice' | 'quote'
  clientName?: string
  clientEmail?: string | null
  clientPhone?: string | null
  clientAddress?: string | null
  currency?: string
  taxPercent?: number
  discountType?: 'none' | 'percent' | 'fixed'
  discountValue?: number
  notes?: string | null
  dueDate?: string | null
  status?: string
  lineItems?: LineItemBody[]
}

export function validateLineItems(lineItems: LineItemBody[]): string | null {
  if (lineItems.length === 0) return 'At least one line item is required'
  for (const li of lineItems) {
    if (!li.description?.trim() || !(li.quantity > 0) || !(li.unitPriceCents >= 0)) {
      return 'Each line item needs a description, a positive quantity, and a non-negative price'
    }
  }
  return null
}

// Shared by the direct admin create route (app/api/admin/invoices) and the
// Amber change-request approval path (app/api/admin/invoices/change-requests/[id])
// — both must apply an identical, identically-validated write, since the
// approval path is the one place a proposed price/invoice actually becomes
// real.
export async function insertNewInvoice(sql: any, fields: InvoiceFields): Promise<{ id: string; number: string }> {
  const type = fields.type === 'quote' ? 'quote' : 'invoice'
  const clientName = (fields.clientName ?? '').trim()
  const lineItems = fields.lineItems ?? []

  if (!clientName) throw new Error('Client name is required')
  const lineItemError = validateLineItems(lineItems)
  if (lineItemError) throw new Error(lineItemError)

  const id = randomUUID()
  const number = await nextInvoiceNumber(sql, type)
  const publicToken = randomUUID()

  await sql`
    INSERT INTO invoices (id, type, number, status, public_token, client_name, client_email, client_phone, client_address, currency, tax_percent, discount_type, discount_value, notes, due_date)
    VALUES (${id}, ${type}, ${number}, 'draft', ${publicToken}, ${clientName}, ${fields.clientEmail ?? null}, ${fields.clientPhone ?? null}, ${fields.clientAddress ?? null}, ${fields.currency ?? 'CAD'}, ${fields.taxPercent ?? 0}, ${fields.discountType ?? 'none'}, ${fields.discountValue ?? 0}, ${fields.notes ?? null}, ${fields.dueDate ?? null})
  `

  let sortOrder = 0
  for (const li of lineItems) {
    await sql`
      INSERT INTO invoice_line_items (id, invoice_id, description, quantity, unit_price_cents, sort_order)
      VALUES (${randomUUID()}, ${id}, ${li.description.trim()}, ${li.quantity}, ${Math.round(li.unitPriceCents)}, ${sortOrder})
    `
    sortOrder++
  }

  return { id, number }
}

export async function applyInvoiceUpdate(sql: any, invoiceId: string, fields: InvoiceFields): Promise<void> {
  const rows = (await sql`SELECT * FROM invoices WHERE id = ${invoiceId}`) as unknown as any[]
  const invoice = rows[0]
  if (!invoice) throw new Error('Invoice not found')
  if (invoice.status === 'paid') throw new Error('A paid invoice cannot be edited')

  const clientName = fields.clientName !== undefined ? fields.clientName.trim() : invoice.client_name
  const clientEmail = fields.clientEmail !== undefined ? fields.clientEmail : invoice.client_email
  const clientPhone = fields.clientPhone !== undefined ? fields.clientPhone : invoice.client_phone
  const clientAddress = fields.clientAddress !== undefined ? fields.clientAddress : invoice.client_address
  const currency = fields.currency ?? invoice.currency
  const taxPercent = fields.taxPercent !== undefined ? fields.taxPercent : Number(invoice.tax_percent)
  const discountType = fields.discountType ?? invoice.discount_type
  const discountValue = fields.discountValue !== undefined ? fields.discountValue : Number(invoice.discount_value)
  const notes = fields.notes !== undefined ? fields.notes : invoice.notes
  const dueDate = fields.dueDate !== undefined ? fields.dueDate : invoice.due_date
  const status = fields.status ?? invoice.status

  await sql`
    UPDATE invoices SET
      client_name = ${clientName}, client_email = ${clientEmail}, client_phone = ${clientPhone}, client_address = ${clientAddress},
      currency = ${currency}, tax_percent = ${taxPercent}, discount_type = ${discountType}, discount_value = ${discountValue},
      notes = ${notes}, due_date = ${dueDate}, status = ${status}, updated_at = now()
    WHERE id = ${invoiceId}
  `

  if (fields.lineItems) {
    const lineItemError = validateLineItems(fields.lineItems)
    if (lineItemError) throw new Error(lineItemError)
    await sql`DELETE FROM invoice_line_items WHERE invoice_id = ${invoiceId}`
    let sortOrder = 0
    for (const li of fields.lineItems) {
      await sql`
        INSERT INTO invoice_line_items (id, invoice_id, description, quantity, unit_price_cents, sort_order)
        VALUES (${randomUUID()}, ${invoiceId}, ${li.description.trim()}, ${li.quantity}, ${Math.round(li.unitPriceCents)}, ${sortOrder})
      `
      sortOrder++
    }
  }
}
