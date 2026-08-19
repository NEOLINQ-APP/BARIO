import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// Dismisses a pending proposal without running it -- the incident is
// marked resolved (not auto_fixed, since nothing was done) so it drops
// out of the open list; a still-real underlying problem will get
// re-detected and re-proposed on the next health-check run.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const rows = (await sql`
      UPDATE neo_incidents SET status = 'resolved', action_taken = 'Denied by admin -- proposal dismissed', resolved_at = now()
      WHERE id = ${params.id} AND status = 'pending_approval'
      RETURNING id
    `) as unknown as { id: string }[]
    if (rows.length === 0) return NextResponse.json({ error: 'No pending approval found for that id' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
