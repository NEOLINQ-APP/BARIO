import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoMembership } from '@/lib/barioOne'
import { nextBoInvoiceNumber, newPublicToken } from '@/lib/barioOneInvoices'
import { triggerWebhooks } from '@/lib/barioOneWebhooks'
import type { BoInvoice, BoInvoiceType } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

const VALID_TYPES: BoInvoiceType[] = ['estimate', 'quote', 'invoice']
const VALID_INTERVALS = ['weekly', 'monthly', 'yearly']

export async function GET() {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`
      SELECT i.*, c.contact_name, c.company_name FROM bo_invoices i
      JOIN bo_customers c ON c.id = i.customer_id
      WHERE i.organization_id = ${org.id}
      ORDER BY i.created_at DESC
    `) as unknown as (BoInvoice & { contact_name: string; company_name: string | null })[]

    return NextResponse.json({ invoices: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, user, org } = auth

    const {
      customerId,
      type,
      items,
      taxPercent,
      taxLabel,
      discountType,
      discountValue,
      notes,
      dueDate,
      isRecurring,
      recurringInterval,
    } = await req.json()

    if (typeof customerId !== 'string' || !customerId.trim()) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }
    const docType: BoInvoiceType = VALID_TYPES.includes(type) ? type : 'invoice'
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 })
    }
    for (const item of items) {
      if (typeof item.description !== 'string' || !item.description.trim()) {
        return NextResponse.json({ error: 'Every line item needs a description' }, { status: 400 })
      }
    }
    const recurring = Boolean(isRecurring) && VALID_INTERVALS.includes(recurringInterval)

    const customerRows = (await sql`SELECT id FROM bo_customers WHERE id = ${customerId} AND organization_id = ${org.id}`) as unknown[]
    if (customerRows.length === 0) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    const id = randomUUID()
    const number = await nextBoInvoiceNumber(sql, org.id, docType)
    const publicToken = newPublicToken()

    const nextRecurrenceDate = recurring ? (dueDate || new Date().toISOString().slice(0, 10)) : null

    await sql.begin(async (tx: any) => {
      await tx`
        INSERT INTO bo_invoices (
          id, organization_id, customer_id, type, number, public_token,
          tax_percent, tax_label, discount_type, discount_value, notes, due_date,
          is_recurring, recurring_interval, next_recurrence_date, created_by_user_id
        )
        VALUES (
          ${id}, ${org.id}, ${customerId}, ${docType}, ${number}, ${publicToken},
          ${Number.isFinite(taxPercent) ? taxPercent : 0}, ${taxLabel || 'Tax'},
          ${['none', 'percent', 'fixed'].includes(discountType) ? discountType : 'none'}, ${Number.isFinite(discountValue) ? discountValue : 0},
          ${notes || null}, ${dueDate || null},
          ${recurring}, ${recurring ? recurringInterval : null}, ${nextRecurrenceDate},
          ${user.id}
        )
      `
      let sortOrder = 0
      for (const item of items) {
        await tx`
          INSERT INTO bo_invoice_items (id, invoice_id, description, quantity, unit_price_cents, sort_order)
          VALUES (${randomUUID()}, ${id}, ${item.description.trim()}, ${Number(item.quantity) || 1}, ${Math.round(Number(item.unitPriceCents) || 0)}, ${sortOrder++})
        `
      }
    })

    if (docType === 'invoice') {
      await triggerWebhooks(sql, org.id, 'invoice.created', { invoiceId: id, number, customerId })
    }

    return NextResponse.json({ ok: true, id, number })
  } catch (err: any) {
    return errorResponse(err)
  }
}
