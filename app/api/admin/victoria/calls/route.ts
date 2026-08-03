import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'
import type { VictoriaCall } from '@/lib/db'

export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const calls = (await sql`SELECT * FROM victoria_calls ORDER BY started_at DESC LIMIT 200`) as unknown as VictoriaCall[]

    const summary: Record<string, { calls: number; minutes: number; costCents: number }> = {}
    for (const c of calls) {
      if (!summary[c.business_key]) summary[c.business_key] = { calls: 0, minutes: 0, costCents: 0 }
      summary[c.business_key].calls += 1
      summary[c.business_key].minutes += c.duration_seconds / 60
      summary[c.business_key].costCents += Number(c.total_cost_cents)
    }

    return NextResponse.json({ ok: true, calls, summary })
  } catch (err) {
    return errorResponse(err)
  }
}
