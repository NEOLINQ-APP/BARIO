import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { db, type BoInvoice, type BoInvoiceItem } from '@/lib/db'
import { nextBoInvoiceNumber, newPublicToken } from '@/lib/barioOneInvoices'

// Same dual-auth + reporting shape as every other cron in this project
// (studio-reconcile, vps-reconcile, wp-hosting-health). Finds every
// recurring invoice whose next_recurrence_date has arrived, stamps out a
// fresh copy (new number/public_token/due_date, same customer/line items/
// tax/discount), and advances the ORIGINAL's own next_recurrence_date —
// the original stays the template, it's never itself re-sent.
export const maxDuration = 60

function advance(date: string, interval: string): string {
  const d = new Date(date)
  if (interval === 'weekly') d.setDate(d.getDate() + 7)
  else if (interval === 'yearly') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const isCron = process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`
  const isAdminKey = process.env.BARIO_ADMIN_API_KEY && authHeader === `Bearer ${process.env.BARIO_ADMIN_API_KEY}`
  if (!isCron && !isAdminKey) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const sql = await db()
  const created: string[] = []
  const errors: string[] = []

  const due = (await sql`
    SELECT * FROM bo_invoices
    WHERE is_recurring = true AND status != 'void' AND next_recurrence_date IS NOT NULL AND next_recurrence_date <= now()
  `) as unknown as BoInvoice[]

  for (const template of due) {
    try {
      const items = (await sql`SELECT * FROM bo_invoice_items WHERE invoice_id = ${template.id} ORDER BY sort_order`) as unknown as BoInvoiceItem[]
      const newId = randomUUID()
      const number = await nextBoInvoiceNumber(sql, template.organization_id, 'invoice')
      const publicToken = newPublicToken()
      const newDueDate = template.due_date ? advance(template.due_date, template.recurring_interval ?? 'monthly') : null

      await sql.begin(async (tx: any) => {
        await tx`
          INSERT INTO bo_invoices (
            id, organization_id, customer_id, type, number, public_token,
            tax_percent, tax_label, discount_type, discount_value, notes, due_date, created_by_user_id
          )
          VALUES (
            ${newId}, ${template.organization_id}, ${template.customer_id}, 'invoice', ${number}, ${publicToken},
            ${template.tax_percent}, ${template.tax_label}, ${template.discount_type}, ${template.discount_value},
            ${template.notes}, ${newDueDate}, ${template.created_by_user_id}
          )
        `
        let sortOrder = 0
        for (const item of items) {
          await tx`
            INSERT INTO bo_invoice_items (id, invoice_id, description, quantity, unit_price_cents, sort_order)
            VALUES (${randomUUID()}, ${newId}, ${item.description}, ${item.quantity}, ${item.unit_price_cents}, ${sortOrder++})
          `
        }
        await tx`
          UPDATE bo_invoices SET next_recurrence_date = ${advance(template.next_recurrence_date!, template.recurring_interval ?? 'monthly')}, updated_at = now()
          WHERE id = ${template.id}
        `
      })
      created.push(number)
    } catch (err: any) {
      errors.push(`${template.id}: ${err.message}`)
    }
  }

  return NextResponse.json({ ok: true, created, errors })
}
