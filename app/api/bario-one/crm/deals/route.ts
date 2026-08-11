import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoModule } from '@/lib/barioOne'
import { runAutomations } from '@/lib/barioOneAutomations'
import { mergeCustomFieldValues } from '@/lib/barioOneCustomFields'
import { ensureDefaultPipeline, getPipelineStages } from '@/lib/barioOnePipelines'
import type { BoDeal } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

export async function GET(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth
    await ensureDefaultPipeline(sql, org.id)

    const pipelineId = new URL(req.url).searchParams.get('pipelineId')
    const rows = (
      pipelineId
        ? await sql`
            SELECT d.*, c.contact_name, c.company_name FROM bo_deals d
            JOIN bo_customers c ON c.id = d.customer_id
            WHERE d.organization_id = ${org.id} AND d.pipeline_id = ${pipelineId}
            ORDER BY d.created_at DESC
          `
        : await sql`
            SELECT d.*, c.contact_name, c.company_name FROM bo_deals d
            JOIN bo_customers c ON c.id = d.customer_id
            WHERE d.organization_id = ${org.id}
            ORDER BY d.created_at DESC
          `
    ) as unknown as (BoDeal & { contact_name: string; company_name: string | null })[]

    return NextResponse.json({ deals: rows.map((d) => ({ ...d, customFields: JSON.parse(d.custom_fields_json) })) })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, user, org } = auth

    const { customerId, title, stage, valueCents, expectedCloseDate, notes, customFields, pipelineId } = await req.json()
    if (typeof customerId !== 'string' || !customerId.trim()) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 })
    }
    if (typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const customerRows = (await sql`SELECT id FROM bo_customers WHERE id = ${customerId} AND organization_id = ${org.id}`) as unknown[]
    if (customerRows.length === 0) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    let targetPipelineId = typeof pipelineId === 'string' && pipelineId.trim() ? pipelineId : null
    if (targetPipelineId) {
      const pipelineRows = (await sql`SELECT id FROM bo_pipelines WHERE id = ${targetPipelineId} AND organization_id = ${org.id}`) as unknown[]
      if (pipelineRows.length === 0) return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 })
    } else {
      targetPipelineId = (await ensureDefaultPipeline(sql, org.id)).id
    }

    const stages = await getPipelineStages(sql, targetPipelineId)
    const stageKeys = stages.map((s) => s.key)
    const dealStage = typeof stage === 'string' && stageKeys.includes(stage) ? stage : stages[0]?.key ?? 'lead'

    const customFieldsJson = await mergeCustomFieldValues(sql, org.id, 'deal', '{}', customFields)

    const id = randomUUID()
    await sql`
      INSERT INTO bo_deals (id, organization_id, customer_id, title, stage, value_cents, expected_close_date, notes, custom_fields_json, pipeline_id, created_by_user_id)
      VALUES (${id}, ${org.id}, ${customerId}, ${title.trim()}, ${dealStage}, ${Number.isFinite(valueCents) ? Math.round(valueCents) : 0}, ${expectedCloseDate || null}, ${notes || null}, ${customFieldsJson}, ${targetPipelineId}, ${user.id})
    `
    await runAutomations(sql, org.id, 'deal.created', { dealId: id, customerId, pipelineId: targetPipelineId, stage: dealStage })
    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
