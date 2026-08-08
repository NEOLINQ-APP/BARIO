import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoApiKey } from '@/lib/barioOneApiAuth'
import { nextBoInvoiceNumber, newPublicToken, computeTotals } from '@/lib/barioOneInvoices'
import type { BoInvoice, BoInvoiceItem } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireBoApiKey(req)
  if (auth instanceof NextResponse) return auth
  const { sql, org } = auth

  try {
    const invoices = (await sql`
      SELECT i.*, c.contact_name, c.company_name FROM bo_invoices i
      JOIN bo_customers c ON c.id = i.customer_id
      WHERE i.organization_id = ${org.id}
      ORDER BY i.created_at DESC LIMIT 200
    `) as unknown as (BoInvoice & { contact_name: string; company_name: string | null })[]

    const results = []
    for (const inv of invoices) {
      const items = (await sql`SELECT * FROM bo_invoice_items WHERE invoice_id = ${inv.id}`) as unknown as BoInvoiceItem[]
      const totals = computeTotals(
        items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unitPriceCents: i.unit_price_cents })),
        Number(inv.tax_percent),
        { type: inv.discount_type, value: Number(inv.discount_value) }
      )
      results.push({
        id: inv.id,
        number: inv.number,
        type: inv.type,
        status: inv.status,
        customer: inv.company_name || inv.contact_name,
        totalCents: totals.totalCents,
        dueDate: inv.due_date,
        publicUrl: `https://www.bario.ca/bo-invoice/${inv.public_token}`,
        createdAt: inv.created_at,
      })
    }
    return NextResponse.json({ invoices: results })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  const auth = await requireBoApiKey(req)
  if (auth instanceof NextResponse) return auth
  const { sql, org } = auth

  try {
    const body = await req.json()
    const customerId = typeof body?.customerId === 'string' ? body.customerId : ''
    const items = Array.isArray(body?.lineItems) ? body.lineItems : []
    if (!customerId) return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    if (items.length === 0) return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 })

    const customerRows = (await sql`SELECT id FROM bo_customers WHERE id = ${customerId} AND organization_id = ${org.id}`) as unknown as unknown[]
    if (customerRows.length === 0) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    const id = randomUUID()
    const number = await nextBoInvoiceNumber(sql, org.id, 'invoice')
    const publicToken = newPublicToken()
    await sql`
      INSERT INTO bo_invoices (id, organization_id, customer_id, type, number, public_token, notes)
      VALUES (${id}, ${org.id}, ${customerId}, 'invoice', ${number}, ${publicToken}, ${body.notes || null})
    `
    let sortOrder = 0
    for (const item of items) {
      await sql`
        INSERT INTO bo_invoice_items (id, invoice_id, description, quantity, unit_price_cents, sort_order)
        VALUES (${randomUUID()}, ${id}, ${String(item.description).slice(0, 200)}, ${Number(item.quantity) || 1}, ${Math.round(Number(item.unitPriceCents) || 0)}, ${sortOrder++})
      `
    }
    return NextResponse.json({ ok: true, id, number, publicUrl: `https://www.bario.ca/bo-invoice/${publicToken}` })
  } catch (err: any) {
    return errorResponse(err)
  }
}
