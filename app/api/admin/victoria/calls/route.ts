import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'
import type { VictoriaCall } from '@/lib/db'

// Optional ?business=unique|afc|sunbuilt and ?since=<ISO datetime> filters —
// added so Victoria's own check_call_log tool (server.js / miko-sms) can
// ask "who called today for AFC" without pulling all 200 rows and filtering
// client-side. No params = original behavior (admin dashboard's full view).
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const url = new URL(req.url)
    const business = url.searchParams.get('business')
    const since = url.searchParams.get('since')

    let calls: VictoriaCall[]
    if (business && since) {
      calls = (await sql`SELECT * FROM victoria_calls WHERE business_key = ${business} AND started_at >= ${since} ORDER BY started_at DESC LIMIT 200`) as unknown as VictoriaCall[]
    } else if (business) {
      calls = (await sql`SELECT * FROM victoria_calls WHERE business_key = ${business} ORDER BY started_at DESC LIMIT 200`) as unknown as VictoriaCall[]
    } else if (since) {
      calls = (await sql`SELECT * FROM victoria_calls WHERE started_at >= ${since} ORDER BY started_at DESC LIMIT 200`) as unknown as VictoriaCall[]
    } else {
      calls = (await sql`SELECT * FROM victoria_calls ORDER BY started_at DESC LIMIT 200`) as unknown as VictoriaCall[]
    }

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
