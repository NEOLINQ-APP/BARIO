import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'
import type { InvoiceChangeRequest } from '@/lib/db'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`SELECT * FROM invoice_change_requests ORDER BY created_at DESC LIMIT 100`) as unknown as InvoiceChangeRequest[]
    return NextResponse.json({ ok: true, changeRequests: rows })
  } catch (err) {
    return errorResponse(err)
  }
}
