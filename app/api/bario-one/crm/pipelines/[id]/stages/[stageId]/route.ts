import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

export async function PATCH(req: Request, { params }: { params: { id: string; stageId: string } }) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can manage pipelines' }, { status: 403 })
    }

    const existing = (await sql`
      SELECT s.id FROM bo_pipeline_stages s
      JOIN bo_pipelines p ON p.id = s.pipeline_id
      WHERE s.id = ${params.stageId} AND s.pipeline_id = ${params.id} AND p.organization_id = ${org.id}
    `) as unknown[]
    if (existing.length === 0) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })

    const { name, position } = await req.json()
    await sql`
      UPDATE bo_pipeline_stages SET
        name = COALESCE(${typeof name === 'string' && name.trim() ? name.trim() : null}, name),
        position = COALESCE(${Number.isFinite(position) ? Math.round(position) : null}, position),
        updated_at = now()
      WHERE id = ${params.stageId}
    `
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string; stageId: string } }) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can manage pipelines' }, { status: 403 })
    }

    const rows = (await sql`
      SELECT s.id, s.key FROM bo_pipeline_stages s
      JOIN bo_pipelines p ON p.id = s.pipeline_id
      WHERE s.id = ${params.stageId} AND s.pipeline_id = ${params.id} AND p.organization_id = ${org.id}
    `) as unknown as { id: string; key: string }[]
    if (rows.length === 0) return NextResponse.json({ error: 'Stage not found' }, { status: 404 })

    const stageCount = (await sql`SELECT count(*)::int as count FROM bo_pipeline_stages WHERE pipeline_id = ${params.id}`) as unknown as { count: number }[]
    if ((stageCount[0]?.count ?? 0) <= 1) {
      return NextResponse.json({ error: 'A pipeline needs at least one stage' }, { status: 400 })
    }

    const dealCount = (await sql`
      SELECT count(*)::int as count FROM bo_deals WHERE pipeline_id = ${params.id} AND stage = ${rows[0].key}
    `) as unknown as { count: number }[]
    if ((dealCount[0]?.count ?? 0) > 0) {
      return NextResponse.json({ error: 'Move deals out of this stage before deleting it' }, { status: 400 })
    }

    await sql`DELETE FROM bo_pipeline_stages WHERE id = ${params.stageId}`
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
