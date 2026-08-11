import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { requireBoMembership } from '@/lib/barioOne'
import { AUTOMATION_ACTIONS, AUTOMATION_TRIGGERS } from '@/lib/barioOneAutomations'
import type { BoAutomation } from '@/lib/db'
import { errorResponse } from '@/lib/errors'

function validateActionConfig(actionType: string, config: Record<string, unknown>): string | null {
  switch (actionType) {
    case 'create_task':
      return typeof config.title === 'string' && config.title.trim() ? null : 'A task title is required'
    case 'add_tag':
      return typeof config.tag === 'string' && config.tag.trim() ? null : 'A tag is required'
    case 'add_note':
      return typeof config.body === 'string' && config.body.trim() ? null : 'A note body is required'
    case 'send_email':
      return typeof config.subject === 'string' && config.subject.trim() && typeof config.body === 'string' && config.body.trim()
        ? null
        : 'A subject and body are required'
    case 'send_sms':
      return typeof config.body === 'string' && config.body.trim() ? null : 'A message body is required'
    default:
      return null
  }
}

export async function GET() {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const rows = (await sql`
      SELECT * FROM bo_automations WHERE organization_id = ${org.id} ORDER BY created_at DESC
    `) as unknown as BoAutomation[]

    return NextResponse.json({
      automations: rows.map((a) => ({ ...a, triggerFilter: JSON.parse(a.trigger_filter_json), actionConfig: JSON.parse(a.action_config_json) })),
    })
  } catch (err: any) {
    return errorResponse(err)
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, user, org, membership } = auth
    if (membership.role === 'employee') {
      return NextResponse.json({ error: 'Only owners and admins can manage automations' }, { status: 403 })
    }

    const { name, triggerEvent, triggerFilter, actionType, actionConfig } = await req.json()
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }
    if (!AUTOMATION_TRIGGERS.includes(triggerEvent)) {
      return NextResponse.json({ error: `triggerEvent must be one of: ${AUTOMATION_TRIGGERS.join(', ')}` }, { status: 400 })
    }
    if (!AUTOMATION_ACTIONS.includes(actionType)) {
      return NextResponse.json({ error: `actionType must be one of: ${AUTOMATION_ACTIONS.join(', ')}` }, { status: 400 })
    }
    const configError = validateActionConfig(actionType, actionConfig ?? {})
    if (configError) return NextResponse.json({ error: configError }, { status: 400 })

    const filter: Record<string, unknown> = {}
    if (triggerEvent === 'deal.stage_changed') {
      if (typeof triggerFilter?.pipelineId === 'string' && triggerFilter.pipelineId) filter.pipelineId = triggerFilter.pipelineId
      if (typeof triggerFilter?.stageKey === 'string' && triggerFilter.stageKey) filter.stageKey = triggerFilter.stageKey
    }

    const id = randomUUID()
    await sql`
      INSERT INTO bo_automations (id, organization_id, name, trigger_event, trigger_filter_json, action_type, action_config_json, created_by_user_id)
      VALUES (${id}, ${org.id}, ${name.trim()}, ${triggerEvent}, ${JSON.stringify(filter)}, ${actionType}, ${JSON.stringify(actionConfig ?? {})}, ${user.id})
    `
    return NextResponse.json({ ok: true, id })
  } catch (err: any) {
    return errorResponse(err)
  }
}
