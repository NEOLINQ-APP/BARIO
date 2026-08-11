import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import { computeSaleTotals, loyaltyPointsForTotal, type SaleLineInput } from '@/lib/barioOnePos'
import { triggerWebhooks } from '@/lib/barioOneWebhooks'
import type { BoProduct } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// The one real checkout path — every line item referencing a real product
// gets its stock checked and decremented inside the same transaction as
// the sale itself (row-locked via FOR UPDATE), so two concurrent
// checkouts can never both sell the last unit of something. A line item
// can also be a free-text item with no productId (e.g. a service charge)
// — those don't touch inventory at all.
export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('pos')
    if (auth instanceof NextResponse) return auth
    const { sql, user, org } = auth

    const { items, customerId, taxPercent, discountCents, paymentMethod } = await req.json()
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one item is required' }, { status: 400 })
    }
    const method = ['cash', 'card', 'other'].includes(paymentMethod) ? paymentMethod : 'cash'

    if (customerId) {
      const customerRows = (await sql`SELECT id FROM bo_customers WHERE id = ${customerId} AND organization_id = ${org.id}`) as unknown[]
      if (customerRows.length === 0) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const saleId = randomUUID()
    let resolvedItems: (SaleLineInput & { productId?: string })[] = []
    let finalTotalCents = 0

    try {
      await sql.begin(async (tx: any) => {
        resolvedItems = []
        for (const item of items) {
          const quantity = Number(item.quantity) || 1
          if (item.productId) {
            const rows = (await tx`SELECT * FROM bo_products WHERE id = ${item.productId} AND organization_id = ${org.id} FOR UPDATE`) as unknown as BoProduct[]
            const product = rows[0]
            if (!product) throw new Error(`Product not found: ${item.productId}`)
            if (product.stock_quantity < quantity) throw new Error(`Not enough stock for "${product.name}" (${product.stock_quantity} left)`)
            await tx`UPDATE bo_products SET stock_quantity = stock_quantity - ${quantity}, updated_at = now() WHERE id = ${product.id}`
            resolvedItems.push({ productId: product.id, description: product.name, quantity, unitPriceCents: product.price_cents })
          } else {
            if (typeof item.description !== 'string' || !item.description.trim()) throw new Error('Every item needs a description')
            resolvedItems.push({ description: item.description.trim(), quantity, unitPriceCents: Math.round(Number(item.unitPriceCents) || 0) })
          }
        }

        const totals = computeSaleTotals(resolvedItems, Number(taxPercent) || 0, Number(discountCents) || 0)
        const loyaltyPoints = customerId ? loyaltyPointsForTotal(totals.totalCents) : 0
        finalTotalCents = totals.totalCents

        await tx`
          INSERT INTO bo_pos_sales (id, organization_id, customer_id, subtotal_cents, tax_cents, discount_cents, total_cents, payment_method, loyalty_points_earned, created_by_user_id)
          VALUES (${saleId}, ${org.id}, ${customerId || null}, ${totals.subtotalCents}, ${totals.taxCents}, ${totals.discountCents}, ${totals.totalCents}, ${method}, ${loyaltyPoints}, ${user.id})
        `
        let sortOrder = 0
        for (const item of resolvedItems) {
          await tx`
            INSERT INTO bo_pos_sale_items (id, sale_id, product_id, description, quantity, unit_price_cents, sort_order)
            VALUES (${randomUUID()}, ${saleId}, ${item.productId || null}, ${item.description}, ${item.quantity}, ${item.unitPriceCents}, ${sortOrder++})
          `
        }
        if (customerId && loyaltyPoints > 0) {
          await tx`UPDATE bo_customers SET loyalty_points = loyalty_points + ${loyaltyPoints}, updated_at = now() WHERE id = ${customerId}`
        }
      })
    } catch (err: any) {
      return NextResponse.json({ error: err.message ?? 'Checkout failed' }, { status: 400 })
    }

    await triggerWebhooks(sql, org.id, 'pos_sale.completed', { saleId, totalCents: finalTotalCents, customerId: customerId || null })

    return NextResponse.json({ ok: true, id: saleId })
  } catch (err: any) {
    return errorResponse(err)
  }
}
