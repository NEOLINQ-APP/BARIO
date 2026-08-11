import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import type { BoProduct } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  try {
    const auth = await requireBoModule('pos')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const url = new URL(req.url)
    const q = url.searchParams.get('q')?.trim()
    const barcode = url.searchParams.get('barcode')?.trim()

    let rows: BoProduct[]
    if (barcode) {
      rows = (await sql`SELECT * FROM bo_products WHERE organization_id = ${org.id} AND barcode = ${barcode}`) as unknown as BoProduct[]
    } else if (q) {
      rows = (await sql`
        SELECT * FROM bo_products WHERE organization_id = ${org.id}
          AND (name ILIKE ${'%' + q + '%'} OR sku ILIKE ${'%' + q + '%'} OR barcode ILIKE ${'%' + q + '%'})
        ORDER BY name
      `) as unknown as BoProduct[]
    } else {
      rows = (await sql`SELECT * FROM bo_products WHERE organization_id = ${org.id} ORDER BY name`) as unknown as BoProduct[]
    }

    return NextResponse.json({ products: rows })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('pos')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can add products' }, { status: 403 })
    }

    const { name, sku, barcode, priceCents, costCents, stockQuantity, lowStockThreshold } = await req.json()
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const id = randomUUID()
    await sql`
      INSERT INTO bo_products (id, organization_id, name, sku, barcode, price_cents, cost_cents, stock_quantity, low_stock_threshold)
      VALUES (
        ${id}, ${org.id}, ${name.trim()}, ${sku || null}, ${barcode || null},
        ${Number.isFinite(priceCents) ? Math.round(priceCents) : 0}, ${Number.isFinite(costCents) ? Math.round(costCents) : 0},
        ${Number.isFinite(stockQuantity) ? Math.round(stockQuantity) : 0}, ${Number.isFinite(lowStockThreshold) ? Math.round(lowStockThreshold) : 5}
      )
    `
    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
