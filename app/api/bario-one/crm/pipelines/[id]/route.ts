import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import { errorResponse } from '@/lib/errors'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can manage pipelines' }, { status: 403 })
    }

    const existing = (await sql`SELECT id FROM bo_pipelines WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown[]
    if (existing.length === 0) return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 })

    const { name, position } = await req.json()
    await sql`
      UPDATE bo_pipelines SET
        name = COALESCE(${typeof name === 'string' && name.trim() ? name.trim() : null}, name),
        position = COALESCE(${Number.isFinite(position) ? Math.round(position) : null}, position),
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
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can manage pipelines' }, { status: 403 })
    }

    const existing = (await sql`SELECT id, is_default FROM bo_pipelines WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as { id: string; is_default: boolean }[]
    if (existing.length === 0) return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 })
    if (existing[0].is_default) {
      return NextResponse.json({ error: 'The default pipeline can\'t be deleted' }, { status: 400 })
    }

    const dealCount = (await sql`SELECT count(*)::int as count FROM bo_deals WHERE pipeline_id = ${params.id}`) as unknown as { count: number }[]
    if ((dealCount[0]?.count ?? 0) > 0) {
      return NextResponse.json({ error: 'Move or delete this pipeline\'s deals before deleting it' }, { status: 400 })
    }

    await sql`DELETE FROM bo_pipelines WHERE id = ${params.id} AND organization_id = ${org.id}`
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
