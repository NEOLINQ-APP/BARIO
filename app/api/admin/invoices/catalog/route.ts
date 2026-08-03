import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getFullCatalog } from '@/lib/invoiceCatalog'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const catalog = await getFullCatalog(sql)
    return NextResponse.json({ ok: true, catalog })
  } catch (err) {
    return errorResponse(err)
  }
}
