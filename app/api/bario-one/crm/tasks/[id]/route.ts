import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const existing = (await sql`SELECT id FROM bo_tasks WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown[]
    if (existing.length === 0) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const { status, title, dueAt } = await req.json()
    if (status !== undefined && status !== 'open' && status !== 'done') {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    await sql`
      UPDATE bo_tasks SET
        status = COALESCE(${status || null}, status),
        title = COALESCE(${title || null}, title),
        due_at = COALESCE(${dueAt || null}, due_at),
        updated_at = now()
      WHERE id = ${params.id} AND organization_id = ${org.id}
    `
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    await sql`DELETE FROM bo_tasks WHERE id = ${params.id} AND organization_id = ${org.id}`
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
