import { NextResponse } from 'next/server'
import { requireBoApiKey } from '@/lib/barioOneApiAuth'
import type { BoProduct } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireBoApiKey(req)
  if (auth instanceof NextResponse) return auth
  const { sql, org } = auth

  try {
    const rows = (await sql`SELECT * FROM bo_products WHERE organization_id = ${org.id} ORDER BY name LIMIT 500`) as unknown as BoProduct[]
    return NextResponse.json({
      products: rows.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        priceCents: p.price_cents,
        stockQuantity: p.stock_quantity,
        status: p.status,
      })),
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}
