import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { listSales, salesSummary } from '@/lib/salesLedger'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth

  try {
    const url = new URL(req.url)
    const startingAfter = url.searchParams.get('cursor') ?? undefined
    const includeSummary = url.searchParams.get('summary') === '1'

    const [{ sales, hasMore, nextCursor }, summary] = await Promise.all([
      listSales({ startingAfter }),
      includeSummary ? salesSummary() : Promise.resolve(null),
    ])

    return NextResponse.json({ ok: true, sales, hasMore, nextCursor, summary })
  } catch (err: any) {
    return errorResponse(err)
  }
}
