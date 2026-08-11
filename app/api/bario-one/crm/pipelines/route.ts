import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import { listPipelinesWithStages, uniqueStageKey } from '@/lib/barioOnePipelines'
import { errorResponse } from '@/lib/errors'

export async function GET() {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const pipelines = await listPipelinesWithStages(sql, org.id)
    return NextResponse.json({ pipelines })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can manage pipelines' }, { status: 403 })
    }

    const { name } = await req.json()
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Pipeline name is required' }, { status: 400 })
    }

    const posRows = (await sql`
      SELECT COALESCE(MAX(position), -1) + 1 as next_position FROM bo_pipelines WHERE organization_id = ${org.id}
    `) as unknown as { next_position: number }[]
    const position = posRows[0]?.next_position ?? 0

    const id = randomUUID()
    await sql`
      INSERT INTO bo_pipelines (id, organization_id, name, is_default, position)
      VALUES (${id}, ${org.id}, ${name.trim()}, false, ${position})
    `
    const firstStageKey = await uniqueStageKey(sql, id, 'New')
    await sql`
      INSERT INTO bo_pipeline_stages (id, pipeline_id, key, name, position)
      VALUES (${randomUUID()}, ${id}, ${firstStageKey}, 'New', 0)
    `

    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
