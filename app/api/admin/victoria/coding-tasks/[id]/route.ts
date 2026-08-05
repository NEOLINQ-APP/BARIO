import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

// Lets the routine mark a queued coding task in_progress (so a second hourly
// run doesn't redo it if the first is still running past the hour) and then
// done/failed with a result summary. See app/api/admin/victoria/coding-tasks/route.ts.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const body = await req.json().catch(() => ({}))
    const status = body?.status
    if (!['in_progress', 'done', 'failed'].includes(status)) {
      return NextResponse.json({ error: 'status must be in_progress, done, or failed' }, { status: 400 })
    }
    const result = typeof body?.result === 'string' ? body.result : null

    if (status === 'in_progress') {
      await sql`UPDATE coding_task_requests SET status = 'in_progress' WHERE id = ${params.id}`
    } else {
      await sql`UPDATE coding_task_requests SET status = ${status}, result = ${result}, completed_at = now() WHERE id = ${params.id}`
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
