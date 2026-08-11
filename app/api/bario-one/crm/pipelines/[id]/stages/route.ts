import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoMembership } from '@/lib/barioOne'
import { uniqueStageKey } from '@/lib/barioOnePipelines'
import { errorResponse } from '@/lib/errors'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can manage pipelines' }, { status: 403 })
    }

    const pipelineRows = (await sql`SELECT id FROM bo_pipelines WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown[]
    if (pipelineRows.length === 0) return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 })

    const { name } = await req.json()
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Stage name is required' }, { status: 400 })
    }

    const posRows = (await sql`
      SELECT COALESCE(MAX(position), -1) + 1 as next_position FROM bo_pipeline_stages WHERE pipeline_id = ${params.id}
    `) as unknown as { next_position: number }[]
    const position = posRows[0]?.next_position ?? 0

    const key = await uniqueStageKey(sql, params.id, name.trim())
    const id = randomUUID()
    await sql`
      INSERT INTO bo_pipeline_stages (id, pipeline_id, key, name, position)
      VALUES (${id}, ${params.id}, ${key}, ${name.trim()}, ${position})
    `
    return NextResponse.json({ ok: true, id, key })
  } catch (err: any) {
    return errorResponse(err)
  }
}
