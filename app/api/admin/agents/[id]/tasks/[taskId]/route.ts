import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { errorResponse } from '@/lib/errors'

export async function PATCH(req: Request, { params }: { params: { id: string; taskId: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    const body = await req.json().catch(() => ({}))
    const status = ['open', 'in_progress', 'done'].includes(body?.status) ? body.status : null
    if (!status) return NextResponse.json({ error: 'status must be open, in_progress, or done' }, { status: 400 })

    await sql`UPDATE agent_tasks SET status = ${status}, updated_at = now() WHERE id = ${params.taskId} AND agent_id = ${params.id}`
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string; taskId: string } }) {
  const auth = await requireAdmin(req)
  if (auth instanceof NextResponse) return auth
  const { sql } = auth

  try {
    await sql`DELETE FROM agent_tasks WHERE id = ${params.taskId} AND agent_id = ${params.id}`
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
