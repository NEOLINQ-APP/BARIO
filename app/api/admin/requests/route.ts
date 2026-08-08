import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  const adminCheck = await requireAdmin(req)
  if (adminCheck instanceof NextResponse) return adminCheck
  const { sql } = adminCheck

  try {
    const requests = await sql`
      SELECT * FROM client_requests
      WHERE status IN ('new', 'in_progress', 'blocked')
      ORDER BY priority ASC, created_at ASC
    `
    const closed = await sql`
      SELECT * FROM client_requests
      WHERE status IN ('done', 'cancelled')
      ORDER BY updated_at DESC
      LIMIT 50
    `
    return NextResponse.json({ ok: true, requests, closed })
  } catch (err) {
    return errorResponse(err)
  }
}
