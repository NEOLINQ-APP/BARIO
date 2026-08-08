import { NextResponse } from 'next/server'
import { requireBoMembership } from '@/lib/barioOne'
import { mergeCustomFieldValues } from '@/lib/barioOneCustomFields'
import { errorResponse } from '@/lib/errors'

const VALID_STAGES = ['lead', 'opportunity', 'quote', 'won', 'lost']

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireBoMembership()
    if (auth instanceof NextResponse) return auth
    const { sql, org } = auth

    const existing = (await sql`SELECT id, custom_fields_json FROM bo_deals WHERE id = ${params.id} AND organization_id = ${org.id}`) as unknown as { id: string; custom_fields_json: string }[]
    if (existing.length === 0) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

    const { title, stage, valueCents, expectedCloseDate, notes, customFields } = await req.json()
    if (stage !== undefined && !VALID_STAGES.includes(stage)) {
      return NextResponse.json({ error: 'Invalid stage' }, { status: 400 })
    }

    const customFieldsJson = await mergeCustomFieldValues(sql, org.id, 'deal', existing[0].custom_fields_json, customFields)

    await sql`
      UPDATE bo_deals SET
        title = COALESCE(${title || null}, title),
        stage = COALESCE(${stage || null}, stage),
        value_cents = COALESCE(${Number.isFinite(valueCents) ? Math.round(valueCents) : null}, value_cents),
        expected_close_date = COALESCE(${expectedCloseDate || null}, expected_close_date),
        notes = COALESCE(${notes || null}, notes),
        custom_fields_json = ${customFieldsJson},
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

    await sql`DELETE FROM bo_deals WHERE id = ${params.id} AND organization_id = ${org.id}`
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return errorResponse(err)
  }
}
