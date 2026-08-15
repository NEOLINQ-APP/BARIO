import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import { nextBoInvoiceNumber, newPublicToken } from '@/lib/barioOneInvoices'
import { triggerWebhooks } from '@/lib/barioOneWebhooks'
import type { BoInvoice, BoInvoiceType } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

const VALID_TYPES: BoInvoiceType[] = ['estimate', 'quote', 'invoice', 'work_order']
const VALID_INTERVALS = ['weekly', 'monthly', 'yearly']

export async function GET() {
  try {
    const auth = await requireBoModule('invoicing')
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
    const auth = await requireBoModule('invoicing')
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
      scheduledDate,
      jobSiteAddress,
      assignedEmployeeId,
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

    // Resolve any productId line items against this org's catalog and
    // snapshot cost_cents at create-time — bo_products.cost_cents can
    // change later, historical invoices must not silently re-price.
    const productIds = Array.from(new Set(items.map((i: any) => i.productId).filter((id: any) => typeof id === 'string')))
    const productCostById = new Map<string, number>()
    if (productIds.length > 0) {
      const productRows = (await sql`
        SELECT id, cost_cents FROM bo_products WHERE organization_id = ${org.id} AND id = ANY(${productIds})
      `) as unknown as { id: string; cost_cents: number }[]
      for (const p of productRows) productCostById.set(p.id, p.cost_cents)
    }
    const recurring = Boolean(isRecurring) && VALID_INTERVALS.includes(recurringInterval)

    const customerRows = (await sql`SELECT id FROM bo_customers WHERE id = ${customerId} AND organization_id = ${org.id}`) as unknown[]
    if (customerRows.length === 0) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    // assigned_employee_id is optional even when supplied — an org without
    // the 'employees' module enabled has no bo_employees rows to assign, so
    // this quietly resolves to null rather than 400ing the whole request.
    let assignedEmployeeIdSafe: string | null = null
    if (docType === 'work_order' && typeof assignedEmployeeId === 'string' && assignedEmployeeId.trim()) {
      const empRows = (await sql`SELECT id FROM bo_employees WHERE id = ${assignedEmployeeId} AND organization_id = ${org.id}`) as unknown[]
      if (empRows.length > 0) assignedEmployeeIdSafe = assignedEmployeeId
    }

    const id = randomUUID()
    const number = await nextBoInvoiceNumber(sql, org.id, docType)
    const publicToken = newPublicToken()

    const nextRecurrenceDate = recurring ? (dueDate || new Date().toISOString().slice(0, 10)) : null

    await sql.begin(async (tx: any) => {
      await tx`
        INSERT INTO bo_invoices (
          id, organization_id, customer_id, type, number, public_token,
          tax_percent, tax_label, discount_type, discount_value, notes, due_date,
          is_recurring, recurring_interval, next_recurrence_date, created_by_user_id,
          scheduled_date, job_site_address, assigned_employee_id
        )
        VALUES (
          ${id}, ${org.id}, ${customerId}, ${docType}, ${number}, ${publicToken},
          ${Number.isFinite(taxPercent) ? taxPercent : 0}, ${taxLabel || 'Tax'},
          ${['none', 'percent', 'fixed'].includes(discountType) ? discountType : 'none'}, ${Number.isFinite(discountValue) ? discountValue : 0},
          ${notes || null}, ${dueDate || null},
          ${recurring}, ${recurring ? recurringInterval : null}, ${nextRecurrenceDate},
          ${user.id},
          ${docType === 'work_order' ? scheduledDate || null : null},
          ${docType === 'work_order' ? jobSiteAddress || null : null},
          ${assignedEmployeeIdSafe}
        )
      `
      let sortOrder = 0
      for (const item of items) {
        const productId = typeof item.productId === 'string' && productCostById.has(item.productId) ? item.productId : null
        const unitCostCents = productId ? productCostById.get(productId)! : 0
        await tx`
          INSERT INTO bo_invoice_items (id, invoice_id, description, quantity, unit_price_cents, sort_order, product_id, unit_cost_cents)
          VALUES (${randomUUID()}, ${id}, ${item.description.trim()}, ${Number(item.quantity) || 1}, ${Math.round(Number(item.unitPriceCents) || 0)}, ${sortOrder++}, ${productId}, ${unitCostCents})
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
