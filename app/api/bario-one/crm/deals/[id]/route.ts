import { NextResponse } from 'next/server'
import { isRecordVisibleToMember, requireBoModule } from '@/lib/barioOne'
import { runAutomations } from '@/lib/barioOneAutomations'
import { mergeCustomFieldValues } from '@/lib/barioOneCustomFields'
import { getPipelineStages } from '@/lib/barioOnePipelines'
import { recalculateLeadScore } from '@/lib/leadPipeline'
import { errorResponse } from '@/lib/errors'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org, membership } = auth

    const existing = (await sql`
      SELECT id, custom_fields_json, pipeline_id, stage, customer_id, assigned_to_user_id FROM bo_deals WHERE id = ${params.id} AND organization_id = ${org.id}
    `) as unknown as { id: string; custom_fields_json: string; pipeline_id: string | null; stage: string; customer_id: string; assigned_to_user_id: string | null }[]
    if (existing.length === 0 || !isRecordVisibleToMember(membership, existing[0].assigned_to_user_id)) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    }

    const { title, stage, valueCents, expectedCloseDate, notes, customFields, pipelineId, assignedToUserId } = await req.json()
    const nextAssignedToUserId =
      membership.role !== 'employee' && assignedToUserId !== undefined
        ? assignedToUserId || null
        : existing[0].assigned_to_user_id

    let targetPipelineId = existing[0].pipeline_id
    let dealStage: string | null = null
    if (typeof pipelineId === 'string' && pipelineId.trim() && pipelineId !== existing[0].pipeline_id) {
      const pipelineRows = (await sql`SELECT id FROM bo_pipelines WHERE id = ${pipelineId} AND organization_id = ${org.id}`) as unknown[]
      if (pipelineRows.length === 0) return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 })
      targetPipelineId = pipelineId
      const stages = await getPipelineStages(sql, targetPipelineId)
      const stageKeys = stages.map((s) => s.key)
      dealStage = typeof stage === 'string' && stageKeys.includes(stage) ? stage : stages[0]?.key ?? null
    } else if (stage !== undefined) {
      const stages = targetPipelineId ? await getPipelineStages(sql, targetPipelineId) : []
      const stageKeys = stages.map((s) => s.key)
      if (!stageKeys.includes(stage)) {
        return NextResponse.json({ error: 'Invalid stage for this pipeline' }, { status: 400 })
      }
      dealStage = stage
    }

    const customFieldsJson = await mergeCustomFieldValues(sql, org.id, 'deal', existing[0].custom_fields_json, customFields)

    await sql`
      UPDATE bo_deals SET
        title = COALESCE(${title || null}, title),
        stage = COALESCE(${dealStage}, stage),
        pipeline_id = COALESCE(${targetPipelineId}, pipeline_id),
        value_cents = COALESCE(${Number.isFinite(valueCents) ? Math.round(valueCents) : null}, value_cents),
        expected_close_date = COALESCE(${expectedCloseDate || null}, expected_close_date),
        notes = COALESCE(${notes || null}, notes),
        custom_fields_json = ${customFieldsJson},
        assigned_to_user_id = ${nextAssignedToUserId},
        updated_at = now()
      WHERE id = ${params.id} AND organization_id = ${org.id}
    `

    if (dealStage && dealStage !== existing[0].stage) {
      await runAutomations(sql, org.id, 'deal.stage_changed', {
        dealId: params.id,
        customerId: existing[0].customer_id,
        pipelineId: targetPipelineId ?? undefined,
        stage: dealStage,
      })
      // Stage is a real intent signal (quoteRequested/readyToPurchase in
      // deriveAutoSignals) — a lead that just moved into "quote" should
      // reflect that in its score immediately, not wait for someone to
      // touch the customer record separately.
      await recalculateLeadScore(sql, org.id, existing[0].customer_id)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoModule('crm')
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    await sql`DELETE FROM bo_deals WHERE id = ${params.id} AND organization_id = ${org.id}`
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
