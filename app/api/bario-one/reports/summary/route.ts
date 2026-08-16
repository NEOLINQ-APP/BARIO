import { NextResponse } from 'next/server'
import { requireBoModule } from '@/lib/barioOne'
import { computeTotals } from '@/lib/barioOneInvoices'
import type { BoInvoice, BoInvoiceItem } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Revenue = real invoices only (estimates/quotes/work orders aren't
// revenue), excluding void ones, anchored on created_at. COGS comes from
// bo_invoice_items.unit_cost_cents (Phase B's cost snapshot) — never
// bo_products.cost_cents directly, since that can change after the fact
// and would silently re-price historical numbers. Expenses only count
// status='confirmed' rows (Phase E) — 'needs_review' rows are excluded
// until the user confirms them.
export async function GET(req: Request) {
  try {
    const auth = await requireBoModule('invoicing')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const url = new URL(req.url)
    const now = new Date()
    const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
    const from = url.searchParams.get('from') || ymd(defaultFrom)
    const to = url.searchParams.get('to') || ymd(now)

    const invoices = (await sql`
      SELECT * FROM bo_invoices
      WHERE organization_id = ${org.id} AND type = 'invoice' AND status != 'void'
        AND created_at::date >= ${from} AND created_at::date <= ${to}
      ORDER BY created_at
    `) as unknown as BoInvoice[]

    const invoiceIds = invoices.map((i) => i.id)
    const items = invoiceIds.length > 0
      ? ((await sql`SELECT * FROM bo_invoice_items WHERE invoice_id = ANY(${invoiceIds})`) as unknown as BoInvoiceItem[])
      : []
    const itemsByInvoice = new Map<string, BoInvoiceItem[]>()
    for (const item of items) {
      const list = itemsByInvoice.get(item.invoice_id) ?? []
      list.push(item)
      itemsByInvoice.set(item.invoice_id, list)
    }

    let subtotalCents = 0
    let discountCents = 0
    let taxCents = 0
    let totalCents = 0
    let cogsCents = 0
    const byMonth = new Map<string, { revenueCents: number; cogsCents: number }>()

    for (const inv of invoices) {
      const invItems = itemsByInvoice.get(inv.id) ?? []
      const totals = computeTotals(
        invItems.map((i) => ({ description: i.description, quantity: Number(i.quantity), unitPriceCents: i.unit_price_cents })),
        Number(inv.tax_percent),
        { type: inv.discount_type, value: Number(inv.discount_value) }
      )
      subtotalCents += totals.subtotalCents
      discountCents += totals.discountCents
      taxCents += totals.taxCents
      totalCents += totals.totalCents
      const invCogs = invItems.reduce((sum, i) => sum + Number(i.quantity) * i.unit_cost_cents, 0)
      cogsCents += invCogs

      const month = String(inv.created_at).slice(0, 7)
      const bucket = byMonth.get(month) ?? { revenueCents: 0, cogsCents: 0 }
      bucket.revenueCents += totals.subtotalCents
      bucket.cogsCents += invCogs
      byMonth.set(month, bucket)
    }

    const expenseRows = (await sql`
      SELECT amount_cents, expense_date FROM bo_expenses
      WHERE organization_id = ${org.id} AND status = 'confirmed'
        AND expense_date IS NOT NULL AND expense_date >= ${from} AND expense_date <= ${to}
    `) as unknown as { amount_cents: number; expense_date: string }[]
    const expensesCents = expenseRows.reduce((sum, e) => sum + e.amount_cents, 0)

    const grossProfitCents = subtotalCents - cogsCents
    const marginPercent = subtotalCents > 0 ? (grossProfitCents / subtotalCents) * 100 : 0
    const netProfitCents = grossProfitCents - expensesCents

    const monthly = Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, revenueCents: v.revenueCents, cogsCents: v.cogsCents }))

    return NextResponse.json({
      from,
      to,
      subtotalCents,
      discountCents,
      taxCents,
      totalCents,
      cogsCents,
      grossProfitCents,
      marginPercent,
      expensesCents,
      netProfitCents,
      invoiceCount: invoices.length,
      monthly,
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
