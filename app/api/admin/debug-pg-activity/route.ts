import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { db } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

// Temporary diagnostic route — safe to remove after the neo_incidents
// hanging-query investigation is closed out. Uses the app's own normal db()
// pathway (proven fast/healthy for other tables) to ask Postgres directly
// what's actually holding things up on neo_incidents, since the DB
// credentials themselves are unreadable (marked Sensitive in Vercel) for a
// direct out-of-band connection.
export async function GET(req: Request) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  try {
    const sql = await db()
    const activity = await sql`
      SELECT pid, state, wait_event_type, wait_event, now() - query_start AS duration, left(query, 200) AS query
      FROM pg_stat_activity
      WHERE query ILIKE '%neo_incidents%' OR state = 'idle in transaction'
      ORDER BY query_start ASC
    `
    return NextResponse.json({ ok: true, activity })
  } catch (err) {
    return errorResponse(err)
  }
}
