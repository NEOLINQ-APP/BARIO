import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// TEMP one-time diagnostic route: real usage of drivers-exam-assist
// (driverscanada.bario.ca's AI tutor) over the past 7 days. Deleted after use.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`
      SELECT key, window_start, count FROM rate_limits
      WHERE key LIKE 'drivers-exam-assist:%' AND window_start >= now() - interval '7 days'
      ORDER BY window_start DESC
    `) as unknown as { key: string; window_start: string; count: number }[]

    const totalCalls = rows.reduce((sum, r) => sum + r.count, 0)
    const distinctIps = new Set(rows.map((r) => r.key.replace('drivers-exam-assist:', ''))).size

    return NextResponse.json({ ok: true, totalCalls, distinctIps, rawRowCount: rows.length, rows })
  } catch (err) {
    return errorResponse(err)
  }
}
